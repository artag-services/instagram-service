export type IgMessageStatus = 'PENDING' | 'SENT' | 'FAILED'

export class Message {
  constructor(
    public readonly id: string,
    public readonly messageId: string,
    public readonly recipient: string,
    public readonly body: string,
    public readonly mediaUrl: string | null,
    public status: IgMessageStatus,
    public readonly createdAt: Date,
  ) {}

  markSent(igMessageId: string): void {
    this.status = 'SENT'
  }

  markFailed(reason: string): void {
    this.status = 'FAILED'
  }
}
