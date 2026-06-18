export interface IgMessageData {
  id: string
  messageId: string
  recipient: string
  body: string
  mediaUrl: string | null
  status: 'PENDING' | 'SENT' | 'FAILED'
  igMessageId: string | null
  errorReason: string | null
  sentAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface CreateIgMessageInput {
  id: string
  messageId: string
  recipient: string
  body: string
  mediaUrl?: string | null
}

export interface IMessageRepository {
  create(data: CreateIgMessageInput): Promise<IgMessageData>
  updateStatus(id: string, status: string, extra?: Partial<IgMessageData>): Promise<void>
  findById(id: string): Promise<IgMessageData | null>
}
