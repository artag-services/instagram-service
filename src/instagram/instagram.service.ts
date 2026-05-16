import { Injectable, Logger } from '@nestjs/common'
import { v4 as uuidv4 } from 'uuid'

import { PrismaService } from '../prisma/prisma.service'
import { MetaGraphClient, MetaGraphException } from './clients/meta-graph.client'
import { N8nClient } from './clients/n8n.client'
import { SendInstagramDto } from './dto/send-instagram.dto'
import { InstagramResponseDto } from './dto/instagram-response.dto'
import { N8nWebhookResponse } from './types/n8n.types'

/**
 * Orchestrates outgoing Instagram messages + N8N AI calls + profile cache.
 *
 * HTTP is delegated to:
 *   - `MetaGraphClient` (keep-alive, timeout, typed errors)
 *   - `N8nClient` (iterative retry, tolerant parsing)
 *
 * This service stays responsible for: persistence (`IgMessage`),
 * fan-out (`sendToRecipients`), profile lookup with DB-cache.
 */
@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly meta: MetaGraphClient,
    private readonly n8n: N8nClient,
  ) {}

  // ─────────────── outbound ───────────────

  async sendToRecipients(dto: SendInstagramDto): Promise<InstagramResponseDto> {
    const results = await Promise.allSettled(
      dto.recipients.map((recipient) =>
        this.sendToOne(dto.messageId, recipient, dto.message, dto.mediaUrl),
      ),
    )

    const errors = results
      .map((r, i) =>
        r.status === 'rejected'
          ? {
              recipient: dto.recipients[i],
              reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
            }
          : null,
      )
      .filter((e): e is { recipient: string; reason: string } => e !== null)

    const sentCount = results.filter((r) => r.status === 'fulfilled').length
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

  /**
   * Send to one recipient. Persists IgMessage, calls Meta, updates status.
   * Returns the Meta-assigned `message_id` on success.
   */
  async sendToOne(
    messageId: string,
    recipient: string,
    message: string,
    mediaUrl?: string | null,
  ): Promise<string> {
    const record = await this.prisma.igMessage.create({
      data: {
        id: uuidv4(),
        messageId,
        recipient,
        body: message,
        mediaUrl: mediaUrl ?? null,
        status: 'PENDING',
      },
    })

    try {
      const igMessageId = await this.meta.sendMessage(recipient, message, mediaUrl)
      await this.prisma.igMessage.update({
        where: { id: record.id },
        data: { status: 'SENT', igMessageId, sentAt: new Date() },
      })
      this.logger.log(`Sent to ${recipient} | igMessageId=${igMessageId}`)
      return igMessageId
    } catch (error) {
      const reason = error instanceof MetaGraphException ? error.message : String(error)
      await this.prisma.igMessage.update({
        where: { id: record.id },
        data: { status: 'FAILED', errorReason: reason },
      })
      this.logger.error(`Failed to send to ${recipient}: ${reason}`)
      throw error instanceof Error ? error : new Error(reason)
    }
  }

  /** Convenience wrapper for ad-hoc sends by IGSID. */
  async sendToInstagramUser(
    igsid: string,
    message: string,
    mediaUrl?: string,
  ): Promise<{ messageId: string; igsid: string; status: 'SENT' | 'FAILED'; timestamp: string }> {
    const messageId = uuidv4()
    try {
      await this.sendToOne(messageId, igsid, message, mediaUrl)
      return { messageId, igsid, status: 'SENT', timestamp: new Date().toISOString() }
    } catch {
      return { messageId, igsid, status: 'FAILED', timestamp: new Date().toISOString() }
    }
  }

  /** Backwards-compatible alias used by AIResponseService callbacks. */
  async sendToOneWithId(
    messageId: string,
    recipient: string,
    message: string,
    mediaUrl?: string | null,
  ): Promise<string> {
    return this.sendToOne(messageId, recipient, message, mediaUrl)
  }

  // ─────────────── conversations & profile ───────────────

  async getConversations(): Promise<Array<{ conversationId: string; igsid: string; username?: string }>> {
    return this.meta.listConversations()
  }

  /**
   * Profile lookup: DB-cache first, fallback to Graph API.
   * Reduces Meta API calls and improves latency for repeat senders.
   */
  async getUserProfileWithCache(igsid: string): Promise<{ displayName?: string; username?: string }> {
    try {
      const existing = await this.prisma.userIdentity.findUnique({
        where: { channelUserId_channel: { channelUserId: igsid, channel: 'instagram' } },
      })

      if (existing?.displayName) {
        const meta = existing.metadata as Record<string, unknown> | null
        return {
          displayName: existing.displayName,
          username: meta?.['username'] as string | undefined,
        }
      }

      const profile = await this.meta.fetchProfile(igsid)
      const displayName = profile.name || profile.username
      return { displayName, username: profile.username }
    } catch (error) {
      this.logger.error(
        `getUserProfileWithCache error: ${error instanceof Error ? error.message : String(error)}`,
      )
      return {}
    }
  }

  // ─────────────── N8N webhook ───────────────

  /**
   * Call N8N to generate AI response. Delegates retry + parsing to N8nClient.
   */
  async callN8NWebhook(
    userId: string,
    userName: string,
    userPhone: string,
    message: string,
    messageId: string,
  ): Promise<N8nWebhookResponse | null> {
    return this.n8n.call({
      userId,
      userName,
      userPhone,
      channel: 'instagram',
      message,
      messageId,
      timestamp: Date.now(),
    })
  }

  // ─────────────── internals ───────────────

  private resolveStatus(sent: number, failed: number): 'SENT' | 'FAILED' | 'PARTIAL' {
    if (failed === 0) return 'SENT'
    if (sent === 0) return 'FAILED'
    return 'PARTIAL'
  }
}
