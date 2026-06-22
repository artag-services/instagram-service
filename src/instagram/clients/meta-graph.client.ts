import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosError, AxiosInstance } from 'axios'
import * as https from 'https'

import { IMetaProfileProvider, ProfileData } from '../../domain/ports/IMetaProfileProvider'

import {
  MetaGraphConversationsResponse,
  MetaGraphError,
  MetaGraphProfileResponse,
  MetaGraphSendResponse,
} from '../types/meta-graph.types'

/**
 * Thin client around Meta Instagram Graph API.
 *
 * Performance optimizations vs the previous inline `axios.post` usage:
 *   - HTTP keep-alive agent → reuses TLS sessions across requests
 *   - Configurable timeout (default 30s) → no hung workers
 *   - Single AxiosInstance with preconfigured auth header
 *
 * Errors normalize to `{ reason, errorCode, detail }` via `MetaGraphException`.
 */
@Injectable()
export class MetaGraphClient implements OnModuleInit, IMetaProfileProvider {
  private readonly logger = new Logger(MetaGraphClient.name)
  private http!: AxiosInstance
  private sendUrl!: string
  private profileBaseUrl!: string
  private pageToken!: string
  private businessAccountId: string | undefined

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const apiVersion = this.config.get<string>('INSTAGRAM_API_VERSION') ?? 'v21.0'
    this.pageToken = this.config.getOrThrow<string>('INSTAGRAM_ACCESS_TOKEN')
    this.businessAccountId = this.config.get<string>('INSTAGRAM_BUSINESS_ACCOUNT_ID')

    const timeoutMs = Number(this.config.get<string>('INSTAGRAM_API_TIMEOUT_MS') ?? 30_000)
    const maxSockets = Number(this.config.get<string>('INSTAGRAM_API_MAX_SOCKETS') ?? 50)

    this.sendUrl = `https://graph.instagram.com/${apiVersion}/me/messages`
    this.profileBaseUrl = `https://graph.instagram.com/${apiVersion}`

    const agent = new https.Agent({
      keepAlive: true,
      maxSockets,
      keepAliveMsecs: 30_000,
    })

    this.http = axios.create({
      timeout: timeoutMs,
      httpsAgent: agent,
      headers: {
        Authorization: `Bearer ${this.pageToken}`,
        'Content-Type': 'application/json',
      },
    })

    this.logger.log(
      `MetaGraphClient ready — apiVersion=${apiVersion} keepAlive=true maxSockets=${maxSockets} timeout=${timeoutMs}ms`,
    )
  }

  /**
   * Send a text or image message. Returns Meta-assigned `message_id`.
   * Throws `MetaGraphException` on Meta-side errors.
   */
  async sendMessage(recipient: string, message: string, mediaUrl?: string | null): Promise<string> {
    const payload = this.buildSendPayload(recipient, message, mediaUrl)
    return this.post(payload, `sendMessage:${recipient}`)
  }

  /** Fetch user profile via IG Graph API (`name`, `username`). */
  async fetchProfile(igsid: string): Promise<MetaGraphProfileResponse> {
    try {
      const response = await this.http.get<MetaGraphProfileResponse>(
        `${this.profileBaseUrl}/${igsid}`,
        { params: { fields: 'username,name', access_token: this.pageToken } },
      )
      return response.data
    } catch (error) {
      const { reason } = this.extractErrorDetail(error)
      this.logger.warn(`fetchProfile[${igsid}] failed: ${reason}`)
      return {}
    }
  }

  /**
   * List conversations for a business account.
   * Uses graph.facebook.com (not graph.instagram.com) per Meta's API.
   */
  async listConversations(): Promise<Array<{ conversationId: string; igsid: string; username?: string }>> {
    if (!this.businessAccountId) {
      this.logger.warn('listConversations called but INSTAGRAM_BUSINESS_ACCOUNT_ID not configured')
      return []
    }
    const apiVersion = this.config.get<string>('INSTAGRAM_API_VERSION') ?? 'v21.0'
    const url = `https://graph.facebook.com/${apiVersion}/${this.businessAccountId}/conversations`
    try {
      const response = await this.http.get<MetaGraphConversationsResponse>(url, {
        params: {
          access_token: this.pageToken,
          fields: 'id,senders,participants,message',
          user_id: this.businessAccountId,
        },
      })
      const conversations = response.data.data ?? []
      return conversations.map((conv) => {
        const sender = Array.isArray(conv.senders)
          ? conv.senders[0]
          : conv.senders?.data?.[0]
        return {
          conversationId: conv.id,
          igsid: sender?.id ?? conv.id,
          username: sender?.name,
        }
      })
    } catch (error) {
      const { reason, errorCode, detail } = this.extractErrorDetail(error)
      this.logger.error(`listConversations failed: ${reason}`)
      throw new MetaGraphException(reason, errorCode, detail)
    }
  }

  // ─────────────── internals ───────────────

  private buildSendPayload(recipient: string, message: string, mediaUrl?: string | null) {
    if (mediaUrl) {
      return {
        recipient: { id: recipient },
        message: {
          attachment: { type: 'image', payload: { url: mediaUrl, is_reusable: true } },
        },
        messaging_type: 'RESPONSE',
      }
    }
    return {
      recipient: { id: recipient },
      message: { text: message },
      messaging_type: 'RESPONSE',
    }
  }

  private async post(payload: object, traceLabel: string): Promise<string> {
    try {
      const response = await this.http.post<MetaGraphSendResponse>(this.sendUrl, payload)
      const messageId = response.data.message_id
      if (!messageId) throw new MetaGraphException('Meta returned no message_id', 0)
      return messageId
    } catch (error) {
      if (error instanceof MetaGraphException) throw error
      const { reason, errorCode, detail } = this.extractErrorDetail(error)
      this.logger.warn(`[${traceLabel}] ${reason}`)
      if (Logger.isLevelEnabled('debug')) {
        this.logger.debug(detail)
      }
      throw new MetaGraphException(reason, errorCode, detail)
    }
  }

  private extractErrorDetail(error: unknown): {
    reason: string
    errorCode: number
    detail: string
  } {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<MetaGraphError>
      const httpStatus = axiosError.response?.status ?? 0
      const metaError = axiosError.response?.data?.error
      const reason = metaError?.message ?? axiosError.message
      const errorCode = metaError?.code ?? httpStatus
      const detail =
        `httpStatus=${httpStatus} metaCode=${metaError?.code ?? 'n/a'} ` +
        `type=${metaError?.type ?? 'n/a'} subcode=${metaError?.error_subcode ?? 'n/a'} ` +
        `traceId=${metaError?.fbtrace_id ?? 'n/a'}`
      return { reason, errorCode, detail }
    }
    const reason = error instanceof Error ? error.message : String(error)
    return { reason, errorCode: 0, detail: reason }
  }
}

/** Custom exception with Meta-specific code, so callers can branch on it. */
export class MetaGraphException extends Error {
  constructor(
    message: string,
    public readonly errorCode: number,
    public readonly detail?: string,
  ) {
    super(message)
    this.name = 'MetaGraphException'
  }
}
