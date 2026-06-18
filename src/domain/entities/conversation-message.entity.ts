export type MessageSender = 'USER' | 'BOT' | 'AGENT' | 'SYSTEM'

export class ConversationMessage {
  constructor(
    public readonly id: string,
    public readonly conversationId: string,
    public readonly sender: MessageSender,
    public readonly content: string,
    public readonly mediaUrl: string | null,
    public readonly externalId: string | null,
    public readonly metadata: Record<string, unknown> | null,
    public readonly createdAt: Date,
  ) {}
}
