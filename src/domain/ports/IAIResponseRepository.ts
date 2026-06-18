import { AIResponseStatus, ChunkStatus } from '../../domain/entities/ai-response.entity'

export interface AIResponseData {
  id: string
  userId: string
  senderId: string
  messageId: string
  originalMessage: string
  aiResponse: string
  status: AIResponseStatus
  model: string | null
  confidence: number | null
  processingTime: number | null
  sentChunks: number
  failureReason: string | null
  createdAt: Date
}

export interface AIResponseChunkData {
  id: string
  aiResponseId: string
  chunkNumber: number
  content: string
  status: ChunkStatus
  retryCount: number
  externalMessageId: string | null
  channel: string | null
  sentAt: Date | null
  createdAt: Date
}

export interface CreateAIResponseInput {
  id: string
  userId: string
  senderId: string
  messageId: string
  originalMessage: string
  aiResponse: string
  model?: string
  confidence?: number
  processingTime?: number
}

export interface CreateAIResponseChunkInput {
  id: string
  aiResponseId: string
  chunkNumber: number
  content: string
}

export interface IAIResponseRepository {
  create(data: CreateAIResponseInput): Promise<AIResponseData>
  createChunks(data: CreateAIResponseChunkInput[]): Promise<AIResponseChunkData[]>
  updateStatus(id: string, status: AIResponseStatus, extra?: Partial<AIResponseData>): Promise<void>
  updateChunkStatus(id: string, status: ChunkStatus, extra?: Partial<AIResponseChunkData>): Promise<void>
  findChunkById(id: string): Promise<AIResponseChunkData | null>
  findChunksByResponseId(aiResponseId: string): Promise<AIResponseChunkData[]>
  findById(id: string): Promise<AIResponseData | null>
}
