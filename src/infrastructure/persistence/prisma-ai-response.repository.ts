import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  IAIResponseRepository,
  AIResponseData,
  AIResponseChunkData,
  CreateAIResponseInput,
  CreateAIResponseChunkInput,
} from '../../domain/ports/IAIResponseRepository'
import { AIResponseStatus, ChunkStatus } from '../../domain/entities/ai-response.entity'

@Injectable()
export class PrismaAIResponseRepository implements IAIResponseRepository {
  private readonly logger = new Logger(PrismaAIResponseRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAIResponseInput): Promise<AIResponseData> {
    const record = await this.prisma.aIResponse.create({
      data: {
        id: data.id,
        userId: data.userId,
        senderId: data.senderId,
        messageId: data.messageId,
        originalMessage: data.originalMessage,
        aiResponse: data.aiResponse,
        model: data.model,
        confidence: data.confidence,
        processingTime: data.processingTime,
        status: 'PENDING',
      },
    })
    return this.toData(record)
  }

  async createChunks(data: CreateAIResponseChunkInput[]): Promise<AIResponseChunkData[]> {
    const records = await this.prisma.aIResponseChunk.createManyAndReturn({
      data: data.map((d) => ({
        id: d.id,
        aiResponseId: d.aiResponseId,
        chunkNumber: d.chunkNumber,
        content: d.content,
        status: 'PENDING' as ChunkStatus,
        retryCount: 0,
      })),
    })
    return records.map((r: any) => this.toChunkData(r))
  }

  async updateStatus(id: string, status: AIResponseStatus, extra?: Partial<AIResponseData>): Promise<void> {
    const updateData: Record<string, unknown> = { status }
    if (extra) {
      if (extra.sentChunks !== undefined) updateData.sentChunks = extra.sentChunks
      if (extra.failureReason !== undefined) updateData.failureReason = extra.failureReason
    }
    await this.prisma.aIResponse.update({
      where: { id },
      data: updateData as any,
    })
  }

  async updateChunkStatus(id: string, status: ChunkStatus, extra?: Partial<AIResponseChunkData>): Promise<void> {
    const updateData: Record<string, unknown> = { status }
    if (extra) {
      if (extra.externalMessageId !== undefined) updateData.externalMessageId = extra.externalMessageId
      if (extra.channel !== undefined) updateData.channel = extra.channel
      if (extra.sentAt !== undefined) updateData.sentAt = extra.sentAt
      if (extra.retryCount !== undefined) updateData.retryCount = extra.retryCount
    }
    await this.prisma.aIResponseChunk.update({
      where: { id },
      data: updateData as any,
    })
  }

  async findChunkById(id: string): Promise<AIResponseChunkData | null> {
    const record = await this.prisma.aIResponseChunk.findUnique({ where: { id } })
    return record ? this.toChunkData(record) : null
  }

  async findChunksByResponseId(aiResponseId: string): Promise<AIResponseChunkData[]> {
    const records = await this.prisma.aIResponseChunk.findMany({
      where: { aiResponseId },
    })
    return records.map((r: any) => this.toChunkData(r))
  }

  async findById(id: string): Promise<AIResponseData | null> {
    const record = await this.prisma.aIResponse.findUnique({ where: { id } })
    return record ? this.toData(record) : null
  }

  private toData(record: any): AIResponseData {
    return {
      id: record.id,
      userId: record.userId,
      senderId: record.senderId,
      messageId: record.messageId,
      originalMessage: record.originalMessage,
      aiResponse: record.aiResponse,
      status: record.status as AIResponseStatus,
      model: record.model ?? null,
      confidence: record.confidence ?? null,
      processingTime: record.processingTime ?? null,
      sentChunks: record.sentChunks,
      failureReason: record.failureReason ?? null,
      createdAt: record.createdAt,
    }
  }

  private toChunkData(record: any): AIResponseChunkData {
    return {
      id: record.id,
      aiResponseId: record.aiResponseId,
      chunkNumber: record.chunkNumber,
      content: record.content,
      status: record.status as ChunkStatus,
      retryCount: record.retryCount,
      externalMessageId: record.externalMessageId ?? null,
      channel: record.channel ?? null,
      sentAt: record.sentAt ?? null,
      createdAt: record.createdAt,
    }
  }
}
