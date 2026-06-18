import { Injectable, Logger } from '@nestjs/common'
import { MetaGraphClient, MetaGraphException } from '../../instagram/clients/meta-graph.client'
import {
  IMessageSender,
  SendMessageInput,
  SendResult,
} from '../../domain/ports/IMessageSender'

@Injectable()
export class MetaApiSender implements IMessageSender {
  private readonly logger = new Logger(MetaApiSender.name)

  constructor(private readonly meta: MetaGraphClient) {}

  async send(input: SendMessageInput): Promise<SendResult> {
    const messageId = await this.meta.sendMessage(input.recipient, input.message, input.mediaUrl)
    return { messageId }
  }
}
