import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common'

import { RabbitMQService } from '../../rabbitmq/rabbitmq.service'
import { ROUTING_KEYS, QUEUES, RABBITMQ_EXCHANGE } from '../../rabbitmq/constants/queues'
import {
  SendMessageUseCase,
} from '../../domain/services/send-message.usecase'
import { ProcessAIUseCase } from '../../domain/services/process-ai.usecase'
import { HandleAIResponseUseCase } from '../../domain/services/handle-ai-response.usecase'
import { ManageConversationUseCase } from '../../domain/services/manage-conversation.usecase'
import { MetaGraphClient } from '../../instagram/clients/meta-graph.client'
import { IEventPublisher } from '../../domain/ports/IEventPublisher'
import { IProfileRepository } from '../../domain/ports/IProfileRepository'
import { InstagramMessagingEvent } from '../../instagram/types/meta-graph.types'
import { SendInstagramDto } from '../../instagram/dto/send-instagram.dto'

const IDENTITY_RESOLVE_ROUTING_KEY = 'channels.identity.resolve'

@Injectable()
export class InstagramConsumer implements OnModuleInit {
  private readonly logger = new Logger(InstagramConsumer.name)

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly sendMessageUseCase: SendMessageUseCase,
    private readonly processAIUseCase: ProcessAIUseCase,
    private readonly handleAIResponseUseCase: HandleAIResponseUseCase,
    private readonly manageConversation: ManageConversationUseCase,
    private readonly meta: MetaGraphClient,
    @Inject('IEventPublisher') private readonly eventBus: IEventPublisher,
    @Inject('IProfileRepository') private readonly profileRepo: IProfileRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    // Delay queue: messages sit here for 5s, then dead-letter to the retry queue
    await this.rabbitmq.assertQueue(QUEUES.INSTAGRAM_AI_RETRY_DELAY, ROUTING_KEYS.INSTAGRAM_AI_RETRY_DELAY, {
      durable: true,
      messageTtl: 5000,
      deadLetterExchange: RABBITMQ_EXCHANGE,
      deadLetterRoutingKey: ROUTING_KEYS.INSTAGRAM_AI_RETRY,
    })

    // Retry queue: consumed after the delay
    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_AI_RETRY, ROUTING_KEYS.INSTAGRAM_AI_RETRY, (p) =>
      this.handleAIRetry(p),
    )

    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_SEND, ROUTING_KEYS.INSTAGRAM_SEND, (p) =>
      this.handleSendMessage(p),
    )
    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_GET_CONVERSATIONS, ROUTING_KEYS.INSTAGRAM_GET_CONVERSATIONS, (p) =>
      this.handleGetConversations(p),
    )
    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_SEND_TO_USER, ROUTING_KEYS.INSTAGRAM_SEND_TO_USER, (p) =>
      this.handleSendToUser(p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_MESSAGE,
      ROUTING_KEYS.INSTAGRAM_MESSAGE_RECEIVED,
      (p) => this.handleMessageReceived(p),
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_COMMENT,
      ROUTING_KEYS.INSTAGRAM_COMMENT_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REACTION,
      ROUTING_KEYS.INSTAGRAM_REACTION_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_SEEN,
      ROUTING_KEYS.INSTAGRAM_SEEN_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REFERRAL,
      ROUTING_KEYS.INSTAGRAM_REFERRAL_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_OPTIN,
      ROUTING_KEYS.INSTAGRAM_OPTIN_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_HANDOVER,
      ROUTING_KEYS.INSTAGRAM_HANDOVER_RECEIVED,
      async (p) => { this.logger.warn('Unhandled event', JSON.stringify(p).slice(0, 200)) },
    )
    await this.rabbitmq.subscribe(QUEUES.INSTAGRAM_AI_RESPONSE, ROUTING_KEYS.INSTAGRAM_AI_RESPONSE, (p) =>
      this.handleAIResponse(p),
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

  private async handleSendMessage(payload: Record<string, unknown>): Promise<void> {
    const dto = payload as unknown as SendInstagramDto
    this.logger.log(`Processing message ${dto.messageId} → ${dto.recipients.length} recipient(s)`)

    const response = await this.sendMessageUseCase.sendToRecipients({
      messageId: dto.messageId,
      recipients: dto.recipients,
      message: dto.message,
      mediaUrl: dto.mediaUrl,
    })

    this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
      messageId: response.messageId,
      status: response.status,
      sentCount: response.sentCount,
      failedCount: response.failedCount,
      errors: response.errors ?? null,
      timestamp: response.timestamp,
    })

    if (response.errors?.length) {
      for (const err of response.errors) {
        this.logger.error(`Msg ${dto.messageId} → ${err.recipient} FAILED: ${err.reason}`)
      }
    }

    this.logger.log(
      `Msg ${dto.messageId} done | ${response.status} | sent=${response.sentCount} failed=${response.failedCount}`,
    )
  }

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

      this.logger.log(`IG message from ${senderId}${isEcho ? ' (echo)' : ''}${isSelf ? ' (self)' : ''}`)

      const profile = await this.profileRepo.getByChannelUserId(senderId, 'instagram')
      const displayName = profile.displayName || senderId

      this.manageConversation.handleIncoming({
        channel: 'instagram',
        channelUserId: senderId,
        messageText,
        messageId,
        timestamp: String(value?.timestamp ?? Math.floor(Date.now() / 1000)),
      }).catch((err: Error) =>
        this.logger.warn(`Conversation creation failed for ${senderId}: ${err.message}`),
      )

      this.eventBus.publish(IDENTITY_RESOLVE_ROUTING_KEY, {
        channel: 'instagram',
        channelUserId: senderId,
        displayName,
        username: profile.username,
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

      this.processAIUseCase.execute({
        senderId,
        senderName: displayName,
        messageText,
        messageId,
        channel: 'instagram',
      }).then((result) => {
        if (result === 'identity_needed') {
          this.logger.log(`AI needs identity for ${senderId}, publishing to delay queue...`)
          this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_AI_RETRY_DELAY, {
            senderId,
            senderName: displayName,
            messageText,
            messageId,
            channel: 'instagram',
          })
        }
      }).catch((error) => {
        this.logger.error(
          `AI processing failed for ${senderId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
    } catch (error) {
      this.logger.error(
        `handleMessageReceived error: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleAIRetry(payload: Record<string, unknown>): Promise<void> {
    const { senderId, senderName, messageText, messageId, channel } = payload as {
      senderId: string
      senderName: string
      messageText: string
      messageId: string
      channel: string
    }
    this.logger.log(`AI retry for ${senderId}`)

    try {
      const result = await this.processAIUseCase.execute({ senderId, senderName, messageText, messageId, channel })
      if (result === 'ai_sent') {
        this.logger.log(`AI sent on retry for ${senderId}`)
      } else if (result === 'identity_needed') {
        this.logger.warn(`AI retry still missing identity for ${senderId}, giving up`)
      }
    } catch (error) {
      this.logger.error(
        `AI retry failed for ${senderId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleAIResponse(payload: Record<string, unknown>): Promise<void> {
    try {
      const { userId, senderId, messageId, aiResponse, confidence, model, processingTime } = payload as {
        userId: string
        senderId: string
        messageId: string
        aiResponse: string
        confidence?: number
        model?: string
        processingTime?: number
      }

      const sendFn = (recipient: string, message: string, chunkMessageId: string) =>
        this.sendMessageUseCase.sendToOneWithId(chunkMessageId, recipient, message, null)

      await this.handleAIResponseUseCase.execute(
        { userId, senderId, messageId, aiResponse, confidence, model, processingTime },
        sendFn,
      )
    } catch (error) {
      this.logger.error(
        `Error handling AI response: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleFailedChunk(payload: Record<string, unknown>): Promise<void> {
    try {
      const { chunkId, aiResponseId, senderId, retryCount } = payload as {
        chunkId: string
        aiResponseId: string
        senderId: string
        retryCount?: number
      }

      const sendFn = (recipient: string, message: string, chunkMessageId: string) =>
        this.sendMessageUseCase.sendToOneWithId(chunkMessageId, recipient, message, null)

      await this.handleAIResponseUseCase.handleFailedChunk(
        chunkId, aiResponseId, senderId, sendFn, retryCount ?? 0,
      )
    } catch (error) {
      this.logger.error(
        `Error handling failed chunk: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async handleGetConversations(payload: Record<string, unknown>): Promise<void> {
    const { correlationId } = payload as { correlationId?: string }

    try {
      const conversations = await this.meta.listConversations()
      this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, { correlationId, conversations, success: true })
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error getting conversations: ${err.message}`)
      if (correlationId) {
        this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
          correlationId, success: false, error: err.message,
        })
      }
    }
  }

  private async handleSendToUser(payload: Record<string, unknown>): Promise<void> {
    const { correlationId, igsid, message, mediaUrl } = payload as {
      correlationId?: string; igsid: string; message: string; mediaUrl?: string
    }

    try {
      const messageId = await this.sendMessageUseCase.sendToOneWithId(
        `rpc-${correlationId ?? Date.now()}`, igsid, message, mediaUrl,
      )
      this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
        correlationId, messageId, igsid, status: 'SENT', timestamp: new Date().toISOString(), success: true,
      })
    } catch (error) {
      const err = error as Error
      this.logger.error(`Error sending to Instagram user ${igsid}: ${err.message}`)
      if (correlationId) {
        this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
          correlationId, igsid, status: 'FAILED', timestamp: new Date().toISOString(), success: false, error: err.message,
        })
      }
    }
  }

  private async handleAIResponseDLQ(payload: Record<string, unknown>): Promise<void> {
    const { aiResponseId, userId, reason } = payload as {
      aiResponseId: string
      userId: string
      reason: string
    }
    this.logger.error(
      `[DLQ] AI Response permanently failed | aiResponseId=${aiResponseId} userId=${userId} reason=${reason}`,
    )
  }
}
