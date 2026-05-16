import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { ConversationCacheService } from '../conversations/conversation-cache.service'
import { PrismaService } from '../prisma/prisma.service'
import { ROUTING_KEYS, QUEUES } from '../rabbitmq/constants/queues'
import { RabbitMQService } from '../rabbitmq/rabbitmq.service'
import { SendInstagramDto } from './dto/send-instagram.dto'
import { InstagramService } from './instagram.service'
import { AIResponseService } from './services/ai-response.service'
import { InstagramMessagingEvent } from './types/meta-graph.types'

const IDENTITY_RESOLVE_ROUTING_KEY = 'channels.identity.resolve'

/**
 * RabbitMQ listener for Instagram events.
 *
 * Optimizations in `processAIResponse`:
 *   - Parallel DB queries (identity + conversation via Promise.all)
 *   - Atomic rate-limit `upsert` (no race condition between check + increment)
 *   - Refund rate-limit slot if N8N returns null
 *   - Fast-path: cache hit + AI off → skip 100% of DB lookups
 *   - Lazy debug logging
 */
@Injectable()
export class InstagramListener implements OnModuleInit {
  private readonly logger = new Logger(InstagramListener.name)
  private aiRateLimitDaily!: number

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly instagram: InstagramService,
    private readonly aiResponseService: AIResponseService,
    private readonly prisma: PrismaService,
    private readonly conversationCache: ConversationCacheService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.aiRateLimitDaily = Number(this.config.get<string>('AI_RATE_LIMIT_DAILY') ?? 20)

    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_SEND, ROUTING_KEYS.INSTAGRAM_SEND, (p) =>
      this.handleSendMessage(p),
    )

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_MESSAGE,
      ROUTING_KEYS.INSTAGRAM_MESSAGE_RECEIVED,
      (p) => this.handleMessageReceived(p),
    )

    // Stub event handlers — currently just log. TODO: implement or remove.
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_COMMENT,
      ROUTING_KEYS.INSTAGRAM_COMMENT_RECEIVED,
      (p) => this.logStub('comment', p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REACTION,
      ROUTING_KEYS.INSTAGRAM_REACTION_RECEIVED,
      (p) => this.logStub('reaction', p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_SEEN,
      ROUTING_KEYS.INSTAGRAM_SEEN_RECEIVED,
      (p) => this.logStub('seen', p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REFERRAL,
      ROUTING_KEYS.INSTAGRAM_REFERRAL_RECEIVED,
      (p) => this.logStub('referral', p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_OPTIN,
      ROUTING_KEYS.INSTAGRAM_OPTIN_RECEIVED,
      (p) => this.logStub('optin', p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_HANDOVER,
      ROUTING_KEYS.INSTAGRAM_HANDOVER_RECEIVED,
      (p) => this.logStub('handover', p),
    )

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE,
      (p) => this.handleAIResponse(p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED,
      (p) => this.handleFailedChunk(p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE_DLQ,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_DLQ,
      (p) => this.handleAIResponseDLQ(p),
    )
  }

  // ─────────────── outgoing ───────────────

  private async handleSendMessage(payload: Record<string, unknown>): Promise<void> {
    const dto = payload as unknown as SendInstagramDto
    this.logger.log(`send ${dto.messageId} → ${dto.recipients.length} recipient(s)`)
    const response = await this.instagram.sendToRecipients(dto)
    this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
      messageId: response.messageId,
      status: response.status,
      sentCount: response.sentCount,
      failedCount: response.failedCount,
      errors: response.errors ?? null,
      timestamp: response.timestamp,
    })
    this.logger.log(
      `send ${dto.messageId} done | status=${response.status} sent=${response.sentCount} failed=${response.failedCount}`,
    )
  }

  // ─────────────── incoming ───────────────

  private async handleMessageReceived(payload: Record<string, unknown>): Promise<void> {
    try {
      const value = payload.value as InstagramMessagingEvent | undefined
      const senderId = value?.sender?.id
      const messageText = value?.message?.text ?? ''
      const messageId = value?.message?.mid ?? `msg_${Date.now()}`

      if (!senderId) {
        this.logger.warn('Instagram message received without sender ID, skipping')
        return
      }

      const isEcho = value?.message?.is_echo === true
      const isSelf = value?.message?.is_self === true

      this.logger.log(
        `📨 IG message from ${senderId}${isEcho ? ' (echo)' : ''}${isSelf ? ' (self)' : ''}`,
      )

      const profile = await this.instagram.getUserProfileWithCache(senderId)
      const displayName = profile?.displayName || senderId

      await this.rabbitmq.publish(IDENTITY_RESOLVE_ROUTING_KEY, {
        channel: 'instagram',
        channelUserId: senderId,
        displayName,
        username: profile?.username,
        avatarUrl: null,
        metadata: {
          igsid: senderId,
          timestamp: value?.timestamp,
          isEcho,
          isSelf,
          messageId,
          messageText,
        },
      })

      // Fire-and-forget — don't block the listener on N8N latency.
      this.processAIResponse(senderId, displayName, messageText, messageId).catch((error) => {
        this.logger.error(
          `processAIResponse failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    } catch (error) {
      this.logger.error(
        `handleMessageReceived error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Resolve identity, check AI gate, atomically reserve a rate-limit slot,
   * call N8N, publish the AI-response event. Refund slot if N8N fails.
   */
  private async processAIResponse(
    senderId: string,
    senderName: string,
    messageText: string,
    messageId: string,
  ): Promise<void> {
    // Fast-path: cache says AI off → no DB hit at all.
    const cached = this.conversationCache.get(senderId)
    if (cached && (!cached.aiEnabled || cached.agentAssigned)) {
      if (Logger.isLevelEnabled('debug')) {
        this.logger.debug(`AI gated (cache) for ${senderId}, skip`)
      }
      return
    }

    // Parallel: identity (+user) and conversation lookup.
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [userIdentity, dbConversation] = await Promise.all([
      this.prisma.userIdentity.findUnique({
        where: { channelUserId_channel: { channelUserId: senderId, channel: 'instagram' } },
        include: { user: true },
      }),
      cached
        ? Promise.resolve(null)
        : this.prisma.conversation.findFirst({
            where: { channelUserId: senderId, channel: 'instagram', status: 'ACTIVE' },
          }),
    ])

    if (!userIdentity) {
      if (Logger.isLevelEnabled('debug')) {
        this.logger.debug(`Identity not found for ${senderId}, skip AI`)
      }
      return
    }
    const user = userIdentity.user

    // Merge cache + DB into a single view of conversation state.
    let conversationId: string | null = cached?.id ?? null
    let aiEnabled: boolean
    let agentAssigned: string | null = null

    if (cached) {
      aiEnabled = cached.aiEnabled
      agentAssigned = cached.agentAssigned
    } else if (dbConversation) {
      conversationId = dbConversation.id
      aiEnabled = dbConversation.aiEnabled
      agentAssigned = dbConversation.agentAssigned ?? null
      this.conversationCache.set(senderId, {
        id: dbConversation.id,
        channelUserId: dbConversation.channelUserId,
        topic: dbConversation.topic,
        aiEnabled,
        agentAssigned,
        userId: dbConversation.userId,
        status: dbConversation.status,
      })
    } else {
      aiEnabled = user.aiEnabled // fall back to user-global flag
    }

    if (!aiEnabled || agentAssigned) {
      if (Logger.isLevelEnabled('debug')) {
        this.logger.debug(
          `AI gated for ${senderId} (aiEnabled=${aiEnabled} agent=${agentAssigned ?? 'none'}), skip`,
        )
      }
      return
    }

    // Atomic rate-limit reservation: one query, no race.
    const rateLimit = await this.prisma.n8NRateLimit.upsert({
      where: {
        userId_service_date: { userId: user.id, service: 'instagram', date: today },
      },
      create: { userId: user.id, service: 'instagram', date: today, callCount: 1 },
      update: { callCount: { increment: 1 } },
    })

    if (rateLimit.callCount > this.aiRateLimitDaily) {
      // Already over budget → refund the slot we just reserved.
      await this.prisma.n8NRateLimit.update({
        where: { id: rateLimit.id },
        data: { callCount: { decrement: 1 } },
      })
      this.logger.warn(
        `User ${user.id} exceeded daily IG AI rate limit (${rateLimit.callCount - 1}/${this.aiRateLimitDaily})`,
      )
      return
    }

    const n8nResponse = await this.instagram.callN8NWebhook(
      user.id,
      senderName,
      senderId,
      messageText,
      messageId,
    )

    if (!n8nResponse) {
      // Refund the slot — the user's quota shouldn't be consumed by our failure.
      await this.prisma.n8NRateLimit.update({
        where: { id: rateLimit.id },
        data: { callCount: { decrement: 1 } },
      })
      this.logger.warn(`N8N returned null for user ${user.id}, slot refunded`)
      return
    }

    await this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_AI_RESPONSE, {
      userId: user.id,
      senderId,
      messageId,
      conversationId,
      aiResponse: n8nResponse.aiResponse || 'No AI response generated',
      confidence: n8nResponse.confidence ?? 0,
      model: n8nResponse.model ?? 'unknown',
      processingTime: n8nResponse.processingTime ?? 0,
      timestamp: Date.now(),
    })

    this.logger.log(
      `AI response published | user=${user.id} model=${n8nResponse.model ?? '?'} ` +
        `confidence=${n8nResponse.confidence ?? '?'}`,
    )
  }

  private logStub(kind: string, payload: Record<string, unknown>): Promise<void> {
    if (Logger.isLevelEnabled('debug')) {
      this.logger.debug(`[stub:${kind}] ${JSON.stringify(payload).slice(0, 200)}`)
    } else {
      this.logger.log(`[stub:${kind}] event received`)
    }
    return Promise.resolve()
  }

  // ─────────────── AI response pipeline (unchanged behavior) ───────────────

  private async handleAIResponse(payload: Record<string, unknown>): Promise<void> {
    try {
      const { userId, senderId, messageId, aiResponse, confidence, model, processingTime } =
        payload as {
          userId: string
          senderId: string
          messageId: string
          aiResponse?: string
          confidence?: number
          model?: string
          processingTime?: number
        }

      const validAiResponse = aiResponse || 'No AI response generated'

      const aiResponseRecord = await this.aiResponseService.createAIResponse({
        userId,
        senderId,
        messageId,
        originalMessage: '',
        aiResponse: validAiResponse,
        model: model ?? 'unknown',
        confidence: confidence ?? 0,
        processingTime: processingTime ?? 0,
      })

      const chunks = this.aiResponseService.splitMessageIntoChunks(validAiResponse)
      if (chunks.length === 0) {
        this.logger.warn(`AI response empty for user ${userId}`)
        await this.aiResponseService.sendToDLQ(aiResponseRecord.id, 'AI response is empty')
        return
      }

      const chunkRecords = await this.aiResponseService.createChunks(aiResponseRecord.id, chunks)

      let sentCount = 0
      for (const chunk of chunkRecords) {
        const result = await this.aiResponseService.sendChunkWithRetry(
          chunk,
          senderId,
          (recipient, message, chunkMessageId) =>
            this.instagram.sendToOne(chunkMessageId, recipient, message, null),
        )

        if (result.success) {
          await this.prisma.aIResponseChunk.update({
            where: { id: chunk.id },
            data: {
              status: 'SENT',
              externalMessageId: result.externalMessageId,
              channel: result.channel,
              sentAt: new Date(),
            },
          })
          sentCount++
        } else {
          await this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED, {
            chunkId: chunk.id,
            aiResponseId: aiResponseRecord.id,
            senderId,
            error: result.error,
          })
        }
      }

      const finalStatus = await this.aiResponseService.updateAIResponseStatus(aiResponseRecord.id)
      this.logger.log(
        `AI response done: ${sentCount}/${chunkRecords.length} chunks sent | status=${finalStatus}`,
      )
    } catch (error) {
      this.logger.error(
        `handleAIResponse error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleFailedChunk(payload: Record<string, unknown>): Promise<void> {
    try {
      const { chunkId } = payload as { chunkId: string }
      await this.aiResponseService.handleFailedChunk(chunkId)
    } catch (error) {
      this.logger.error(
        `handleFailedChunk error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleAIResponseDLQ(payload: Record<string, unknown>): Promise<void> {
    const { aiResponseId, userId, reason } = payload as {
      aiResponseId: string
      userId: string
      reason: string
    }
    this.logger.error(`[DLQ] aiResponse=${aiResponseId} user=${userId} reason=${reason}`)
  }
}
