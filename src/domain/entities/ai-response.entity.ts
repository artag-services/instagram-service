export type AIResponseStatus = 'PENDING' | 'SENT' | 'PARTIAL' | 'FAILED'

export type ChunkStatus = 'PENDING' | 'SENT' | 'FAILED'

export class AIResponseEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly senderId: string,
    public readonly messageId: string,
    public readonly originalMessage: string,
    public readonly aiResponse: string,
    public status: AIResponseStatus,
    public readonly model: string | null,
    public readonly confidence: number | null,
    public readonly processingTime: number | null,
    public sentChunks: number,
    public readonly failureReason: string | null,
    public readonly createdAt: Date,
  ) {}
}

export class AIResponseChunkEntity {
  constructor(
    public readonly id: string,
    public readonly aiResponseId: string,
    public readonly chunkNumber: number,
    public readonly content: string,
    public status: ChunkStatus,
    public retryCount: number,
    public externalMessageId: string | null,
    public readonly sentAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  markSent(externalMessageId: string): void {
    this.status = 'SENT'
    this.externalMessageId = externalMessageId
  }

  markFailed(): void {
    this.status = 'FAILED'
  }

  incrementRetry(): void {
    this.retryCount++
  }
}
