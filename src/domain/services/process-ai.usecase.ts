import { IAIService } from '../ports/IAIService'
import { ICacheService } from '../ports/ICacheService'
import { IConversationRepository } from '../ports/IConversationRepository'
import { IRateLimitService } from '../ports/IRateLimitService'
import { IEventPublisher } from '../ports/IEventPublisher'
import { IUserIdentityRepository } from '../ports/IUserIdentityRepository'

export interface AIProcessInput {
  senderId: string
  senderName: string
  messageText: string
  messageId: string
  channel: string
}

export type AIProcessResult = 'ai_sent' | 'identity_needed' | 'skipped'

export class ProcessAIUseCase {
  private readonly aiRateLimitDaily: number

  constructor(
    private readonly cache: ICacheService,
    private readonly conversationRepo: IConversationRepository,
    private readonly identityRepo: IUserIdentityRepository,
    private readonly aiService: IAIService,
    private readonly rateLimiter: IRateLimitService,
    private readonly eventBus: IEventPublisher,
    aiRateLimitDaily?: number,
  ) {
    this.aiRateLimitDaily = aiRateLimitDaily ?? 20
  }

  async execute(input: AIProcessInput): Promise<AIProcessResult> {
    const cached = this.cache.get(input.senderId)
    if (cached && (!cached.aiEnabled || cached.agentAssigned)) {
      return 'skipped'
    }

    const dbConversation = cached
      ? null
      : await this.conversationRepo.findActiveByChannelUser(input.senderId, input.channel)

    const conversation = cached ?? dbConversation

    if (conversation) {
      if (!conversation.aiEnabled || conversation.agentAssigned) return 'skipped'
    }

    let userId = conversation?.userId ?? null

    if (!userId) {
      const identity = await this.identityRepo.findByChannelUser(input.senderId, input.channel)
      if (!identity) {
        // Identity not resolved yet — caller should retry after identity service processes.
        return 'identity_needed'
      }
      if (!identity.aiEnabled) return 'skipped'
      userId = identity.userId
    }

    const hasCapacity = await this.rateLimiter.checkAndIncrement(userId, input.channel)
    if (!hasCapacity) return 'skipped'

    const aiResponse = await this.aiService.invoke({
      userId,
      userName: input.senderName,
      userPhone: input.senderId,
      message: input.messageText,
      messageId: input.messageId,
    })

    if (!aiResponse) {
      await this.rateLimiter.refund(userId, input.channel)
      return 'skipped'
    }

    this.eventBus.publish('channels.instagram.ai-response', {
      userId,
      senderId: input.senderId,
      messageId: input.messageId,
      conversationId: conversation?.id ?? null,
      aiResponse: aiResponse.aiResponse,
      confidence: aiResponse.confidence ?? 0,
      model: aiResponse.model ?? 'unknown',
      processingTime: aiResponse.processingTime ?? 0,
      timestamp: Date.now(),
    })

    return 'ai_sent'
  }
}
