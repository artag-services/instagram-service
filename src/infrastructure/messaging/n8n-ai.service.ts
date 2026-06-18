import { Injectable, Logger } from '@nestjs/common'
import { N8nClient } from '../../instagram/clients/n8n.client'
import {
  IAIService,
  AIInvokeInput,
  AIResponse,
} from '../../domain/ports/IAIService'

@Injectable()
export class N8nAIService implements IAIService {
  private readonly logger = new Logger(N8nAIService.name)

  constructor(private readonly n8n: N8nClient) {}

  async invoke(input: AIInvokeInput): Promise<AIResponse | null> {
    const result = await this.n8n.call({
      userId: input.userId,
      userName: input.userName,
      userPhone: input.userPhone,
      channel: 'instagram',
      message: input.message,
      messageId: input.messageId,
      timestamp: Date.now(),
    })

    if (!result) return null

    return {
      aiResponse: result.aiResponse,
      confidence: result.confidence,
      model: result.model,
      processingTime: result.processingTime,
    }
  }
}
