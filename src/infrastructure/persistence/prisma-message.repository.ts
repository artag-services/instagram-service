import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  IMessageRepository,
  IgMessageData,
  CreateIgMessageInput,
} from '../../domain/ports/IMessageRepository'

@Injectable()
export class PrismaMessageRepository implements IMessageRepository {
  private readonly logger = new Logger(PrismaMessageRepository.name)

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateIgMessageInput): Promise<IgMessageData> {
    const record = await this.prisma.igMessage.create({
      data: {
        id: data.id,
        messageId: data.messageId,
        recipient: data.recipient,
        body: data.body,
        mediaUrl: data.mediaUrl ?? null,
        status: 'PENDING',
      },
    })
    return this.toData(record)
  }

  async updateStatus(id: string, status: string, extra?: Partial<IgMessageData>): Promise<void> {
    const updateData: Record<string, unknown> = { status }
    if (extra) {
      if (extra.igMessageId !== undefined) updateData.igMessageId = extra.igMessageId
      if (extra.sentAt !== undefined) updateData.sentAt = extra.sentAt
      if (extra.errorReason !== undefined) updateData.errorReason = extra.errorReason
    }
    await this.prisma.igMessage.update({
      where: { id },
      data: updateData as any,
    })
  }

  async findById(id: string): Promise<IgMessageData | null> {
    const record = await this.prisma.igMessage.findUnique({ where: { id } })
    return record ? this.toData(record) : null
  }

  private toData(record: any): IgMessageData {
    return {
      id: record.id,
      messageId: record.messageId,
      recipient: record.recipient,
      body: record.body,
      mediaUrl: record.mediaUrl ?? null,
      status: record.status,
      igMessageId: record.igMessageId ?? null,
      errorReason: record.errorReason ?? null,
      sentAt: record.sentAt ?? null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }
  }
}
