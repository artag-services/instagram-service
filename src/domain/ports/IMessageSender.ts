export interface SendMessageInput {
  recipient: string
  message: string
  mediaUrl?: string | null
}

export interface SendResult {
  messageId: string
}

export interface IMessageSender {
  send(input: SendMessageInput): Promise<SendResult>
}
