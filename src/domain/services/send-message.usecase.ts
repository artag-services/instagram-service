import { v4 as uuidv4 } from 'uuid'
import { IMessageRepository, CreateIgMessageInput } from '../ports/IMessageRepository'
import { IMessageSender } from '../ports/IMessageSender'
import { Message } from '../entities/message.entity'

export interface SendMessageInput {
  messageId: string
  recipients: string[]
  message: string
  mediaUrl?: string | null
}

export interface SendMessageOutput {
  messageId: string
  status: 'SENT' | 'FAILED' | 'PARTIAL'
  sentCount: number
  failedCount: number
  errors?: Array<{ recipient: string; reason: string }>
  timestamp: string
}

export class SendMessageUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly sender: IMessageSender,
  ) {}

  async sendToRecipients(dto: SendMessageInput): Promise<SendMessageOutput> {
    const results = await Promise.allSettled(
      dto.recipients.map((recipient) =>
        this.sendToOneWithId(dto.messageId, recipient, dto.message, dto.mediaUrl),
      ),
    )

    const errors: Array<{ recipient: string; reason: string }> = []
    let sentCount = 0
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        sentCount++
      } else {
        errors.push({
          recipient: dto.recipients[idx],
          reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
      }
    })

    const failedCount = errors.length
    return {
      messageId: dto.messageId,
      status: this.resolveStatus(sentCount, failedCount),
      sentCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    }
  }

  async sendToOneWithId(
    messageId: string,
    recipient: string,
    message: string,
    mediaUrl?: string | null,
  ): Promise<string> {
    const record = await this.messageRepo.create({
      id: uuidv4(),
      messageId,
      recipient,
      body: message,
      mediaUrl: mediaUrl ?? null,
    })

    try {
      const result = await this.sender.send({ recipient, message, mediaUrl })
      await this.messageRepo.updateStatus(record.id, 'SENT', {
        igMessageId: result.messageId,
        sentAt: new Date(),
      })
      return result.messageId
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.messageRepo.updateStatus(record.id, 'FAILED', { errorReason: reason })
      throw error instanceof Error ? error : new Error(reason)
    }
  }

  private resolveStatus(sent: number, failed: number): 'SENT' | 'FAILED' | 'PARTIAL' {
    if (failed === 0) return 'SENT'
    if (sent === 0) return 'FAILED'
    return 'PARTIAL'
  }
}
