import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Conversation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TopicDetectionService } from './topic-detection.service';
import { ConversationCacheService, CachedConversation } from './conversation-cache.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ROUTING_KEYS } from '../rabbitmq/constants/queues';

interface ConversationIncomingPayload {
  channel: string;
  channelUserId: string;
  messageText: string;
  messageId: string;
  timestamp: string;
  mediaUrl?: string;
  mediaType?: string;
}

/**
 * Routing keys for the CQRS read model (consumed by sync-service).
 * Rule: emit AFTER Postgres writes commit. Source of truth lives here.
 */
const DATA_EVENTS = {
  CONVERSATION_CREATED: 'data.instagram.conversation.created',
  MESSAGE_RECEIVED: 'data.instagram.message.received',
} as const;

/**
 * Listens for conversation.incoming events from the Gateway
 * Creates new Conversation records and publishes conversation.created events
 * Also saves the first incoming message to ConversationMessage
 */
@Injectable()
export class ConversationListener {
  private readonly logger = new Logger(ConversationListener.name);

  constructor(
    private prisma: PrismaService,
    private topicDetection: TopicDetectionService,
    private cache: ConversationCacheService,
    private rabbitmq: RabbitMQService,
  ) {}

  /**
   * Handle incoming conversation event
   * Creates or updates Conversation and saves the first message
   */
  @RabbitSubscribe({
    exchange: 'channels',
    routingKey: 'channels.conversation.incoming',
    queue: 'instagram.conversation.incoming',
  })
  async handleConversationIncoming(payload: ConversationIncomingPayload) {
    try {
      // Only process Instagram messages
      if (payload.channel !== 'instagram') {
        this.logger.debug(`Ignoring conversation.incoming for channel: ${payload.channel}`);
        return;
      }

      this.logger.log(
        `Processing conversation incoming from user: ${payload.channelUserId}`
      );

      const { channel, channelUserId, messageText, messageId, timestamp, mediaUrl } = payload;

      // ✅ TAREA 2: Parse timestamp from Unix timestamp (string) to Date
      let messageTimestamp: Date;
      try {
        const unixTimestamp = parseInt(timestamp, 10);
        messageTimestamp = new Date(unixTimestamp * 1000);
      } catch (error) {
        this.logger.warn(`Invalid timestamp: ${timestamp}, using current time`);
        messageTimestamp = new Date();
      }

      // 1. Detect topic from message text
      const topic = this.topicDetection.detectTopic(messageText);
      const keywords = this.topicDetection.extractKeywords(messageText, topic);

      // ✅ Upsert to dedupe conversations. Prisma doesn't tell us whether
      // the row was created or just updated, so we exploit:
      //   on INSERT  → createdAt === updatedAt (same timestamp in one stmt)
      //   on UPDATE  → updatedAt > createdAt
      // This drives the wasCreated flag so we only fire
      // data.instagram.conversation.created once per conversation.
      const conversation = await this.prisma.conversation.upsert({
        where: {
          channelUserId_channel_status: {
            channelUserId,
            channel,
            status: 'ACTIVE',
          },
        },
        update: {
          messageCount: { increment: 1 },
          lastMessageAt: messageTimestamp,
          updatedAt: new Date(),
        },
        create: {
          userId: null, // Will be backfilled when Identity resolves.
          channelUserId,
          channel,
          topic,
          detectionMethod: 'KEYWORDS',
          keywords,
          aiEnabled: true,
          status: 'ACTIVE',
          messageCount: 1,
          aiMessageCount: 0,
          lastMessageAt: messageTimestamp,
        },
      });
      const wasCreated = conversation.createdAt.getTime() === conversation.updatedAt.getTime();
      this.logger.log(
        `✅ Conversation ${wasCreated ? 'created' : 'updated'}: ${conversation.id} | Topic: ${topic}`,
      );

      // ✅ Save the incoming message to ConversationMessage
      let messageSaved = false;
      try {
        await this.prisma.conversationMessage.create({
          data: {
            conversationId: conversation.id,
            sender: 'USER',
            content: messageText,
            mediaUrl: mediaUrl || null,
            externalId: messageId,
            metadata: {
              channelUserId,
              unixTimestamp: parseInt(timestamp, 10),
              mediaType: payload.mediaType || null,
            },
          },
        });
        messageSaved = true;
        this.logger.debug(
          `✅ ConversationMessage saved for conversation ${conversation.id} | mediaUrl: ${mediaUrl || 'none'}`,
        );
      } catch (msgError) {
        this.logger.error(
          `Failed to save ConversationMessage: ${msgError instanceof Error ? msgError.message : msgError}`,
        );
        // Don't throw — conversation row is fine. We still publish the
        // conversation snapshot but skip message.received because no row exists.
      }

      // 2. Update in-memory cache
      const cachedConv: CachedConversation = {
        id: conversation.id,
        channelUserId,
        topic,
        aiEnabled: true,
        userId: null,
        status: 'ACTIVE',
        agentAssigned: null,
      };
      this.cache.set(channelUserId, cachedConv);

      // 3. Legacy in-channel `channels.conversation.created` — kept for
      //    back-compat with other consumers (not for sync-service).
      if (wasCreated) {
        await this.rabbitmq.publish(ROUTING_KEYS.CONVERSATION_CREATED, {
          conversationId: conversation.id,
          channel,
          channelUserId,
          topic,
          aiEnabled: true,
          messageId,
          timestamp: messageTimestamp.toISOString(),
          createdAt: conversation.createdAt.toISOString(),
        } as unknown as Record<string, unknown>);
        this.logger.log(`✅ Published channels.conversation.created: ${conversation.id}`);
      }

      // 4. CQRS data.* events for sync-service.
      //    Fires AFTER Postgres has committed. Conversation snapshot only on
      //    actual creation; message.received only if the row persisted.
      if (wasCreated) {
        await this.publishConversationSnapshot(conversation);
      }
      if (messageSaved) {
        await this.publishMessageReceived({
          messageId,
          channelUserId,
          conversationId: conversation.id,
          content: messageText,
          mediaUrl: mediaUrl ?? null,
          userId: conversation.userId,
          occurredAt: messageTimestamp,
        });
      }
    } catch (error) {
      this.logger.error(
        'Error handling conversation incoming event:',
        error instanceof Error ? error.message : error
      );
      // Don't throw - let message processing continue independently
    }
  }

  /**
   * Listen for AI toggle events (when conversation.aiEnabled is changed)
   */
  @RabbitSubscribe({
    exchange: 'channels',
    routingKey: 'channels.conversation.ai-toggle',
    queue: 'instagram.conversation.ai-toggle',
  })
  async handleAIToggle(payload: {conversationId: string; aiEnabled: boolean}) {
    try {
      const {conversationId, aiEnabled} = payload;

      // Update database
      const updated = await this.prisma.conversation.update({
        where: {id: conversationId},
        data: {aiEnabled, updatedAt: new Date()},
      });

      this.logger.log(
        `✅ Conversation AI toggled: ${conversationId} → ${aiEnabled}`
      );

      // Update cache (cache stores by channelUserId, not conversationId)
      if (updated.channelUserId) {
        this.cache.update(updated.channelUserId, {aiEnabled});
      }

      // Mirror the change into the read model.
      await this.publishConversationSnapshot(updated);
    } catch (error) {
      this.logger.error('Error handling AI toggle event:', error);
    }
  }

  /**
   * Listen for agent assignment events
   */
  @RabbitSubscribe({
    exchange: 'channels',
    routingKey: 'channels.conversation.agent-assign',
    queue: 'instagram.conversation.agent-assign',
  })
  async handleAgentAssign(payload: {
    conversationId: string;
    agentAssigned: string;
  }) {
    try {
      const {conversationId, agentAssigned} = payload;

      // Update database: set agent and disable AI
      const updated = await this.prisma.conversation.update({
        where: {id: conversationId},
        data: {
          agentAssigned: agentAssigned || null,
          aiEnabled: agentAssigned ? false : true, // Disable AI when agent assigned
          status: agentAssigned ? 'WITH_AGENT' : 'ACTIVE',
          updatedAt: new Date(),
        },
      });

      this.logger.log(
        `✅ Agent assigned to conversation: ${conversationId} → ${
          agentAssigned || 'UNASSIGNED'
        }`
      );

      // Update cache (cache stores by channelUserId, not conversationId)
      if (updated.channelUserId) {
        this.cache.update(updated.channelUserId, {
          aiEnabled: agentAssigned ? false : true,
          status: agentAssigned ? 'WITH_AGENT' : 'ACTIVE',
        });
      }

      // Mirror the change into the read model.
      await this.publishConversationSnapshot(updated);
    } catch (error) {
      this.logger.error('Error handling agent assign event:', error);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // CQRS publishers — every method here runs AFTER Postgres has committed.
  // Payloads are built from the persisted row, not from the inbound DTO,
  // so sync-service always sees the final state.
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Emit a conversation snapshot. Reused on creation, AI toggle, and agent
   * assignment. Sync's projector upserts so replaying is safe.
   *
   * Routing key stays `data.instagram.conversation.created` for back-compat;
   * the projector treats it as "the current state of this conversation."
   */
  private async publishConversationSnapshot(conversation: Conversation): Promise<void> {
    await this.rabbitmq.publish(DATA_EVENTS.CONVERSATION_CREATED, {
      conversationId: conversation.id,
      channel: 'instagram',
      channelUserId: conversation.channelUserId,
      topic: conversation.topic ?? null,
      userId: conversation.userId ?? null,
      status: conversation.status,
      aiEnabled: conversation.aiEnabled,
      agentAssigned: conversation.agentAssigned ?? null,
      createdAt: conversation.createdAt.toISOString(),
    } as unknown as Record<string, unknown>);
  }

  /** Emit a user-sent message. Always paired with a saved ConversationMessage. */
  private async publishMessageReceived(args: {
    messageId: string;
    channelUserId: string;
    conversationId: string;
    content: string;
    mediaUrl: string | null;
    userId: string | null;
    occurredAt: Date;
  }): Promise<void> {
    await this.rabbitmq.publish(DATA_EVENTS.MESSAGE_RECEIVED, {
      messageId: args.messageId,
      senderId: args.channelUserId,
      channelUserId: args.channelUserId,
      conversationId: args.conversationId,
      content: args.content,
      mediaUrl: args.mediaUrl,
      userId: args.userId,
      channel: 'instagram',
      timestamp: args.occurredAt.toISOString(),
    } as unknown as Record<string, unknown>);
  }
}
