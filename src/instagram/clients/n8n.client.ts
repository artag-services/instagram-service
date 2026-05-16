import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosError, AxiosInstance } from 'axios'
import * as https from 'https'

import { N8nWebhookRequest, N8nWebhookResponse } from '../types/n8n.types'

/**
 * Thin client around the N8N AI webhook.
 *
 * Improvements vs the previous inline retry-recursive implementation:
 *   - HTTP keep-alive agent → reuses TLS sessions
 *   - Iterative retry loop (no stack-frame waste)
 *   - Tolerant response parsing (array / object / JSON-string-of-array)
 *   - Configurable timeout / retries / delay via env
 */
@Injectable()
export class N8nClient implements OnModuleInit {
  private readonly logger = new Logger(N8nClient.name)
  private http!: AxiosInstance
  private webhookUrl!: string
  private maxRetries!: number
  private retryDelayMs!: number

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.webhookUrl = this.config.getOrThrow<string>('N8N_WEBHOOK_URL')
    const timeoutMs = Number(this.config.get<string>('N8N_WEBHOOK_TIMEOUT_MS') ?? 5_000)
    this.maxRetries = Number(this.config.get<string>('N8N_WEBHOOK_RETRIES') ?? 1)
    this.retryDelayMs = Number(this.config.get<string>('N8N_WEBHOOK_RETRY_DELAY_MS') ?? 1_000)

    const agent = new https.Agent({
      keepAlive: true,
      maxSockets: 50,
      keepAliveMsecs: 30_000,
    })

    this.http = axios.create({
      timeout: timeoutMs,
      httpsAgent: agent,
      headers: { 'Content-Type': 'application/json' },
    })

    this.logger.log(
      `N8nClient ready — url=${this.webhookUrl} timeout=${timeoutMs}ms retries=${this.maxRetries}`,
    )
  }

  /**
   * Call N8N webhook with iterative retries. Returns `null` on permanent failure.
   */
  async call(payload: N8nWebhookRequest): Promise<N8nWebhookResponse | null> {
    const totalAttempts = this.maxRetries + 1

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      try {
        const response = await this.http.post<N8nWebhookResponse[] | N8nWebhookResponse | string>(
          this.webhookUrl,
          payload,
        )
        const parsed = this.parseResponse(response.data)
        if (!parsed.aiResponse) {
          throw new Error('N8N response missing aiResponse field')
        }
        this.logger.log(
          `[n8n] success messageId=${payload.messageId} userId=${payload.userId} ` +
            `aiResponseLen=${parsed.aiResponse.length} model=${parsed.model ?? '?'}`,
        )
        return parsed
      } catch (error) {
        const { reason, detail } = this.extractError(error)
        if (attempt < totalAttempts) {
          this.logger.warn(
            `[n8n] attempt ${attempt}/${totalAttempts} failed: ${reason}. Retrying in ${this.retryDelayMs}ms`,
          )
          if (Logger.isLevelEnabled('debug')) this.logger.debug(detail)
          await this.sleep(this.retryDelayMs)
        } else {
          this.logger.error(
            `[n8n] failed after ${totalAttempts} attempts | userId=${payload.userId} | ${reason}`,
          )
          if (Logger.isLevelEnabled('debug')) this.logger.debug(detail)
        }
      }
    }
    return null
  }

  // ─────────────── internals ───────────────

  private parseResponse(data: unknown): N8nWebhookResponse {
    let value: unknown = data

    if (typeof value === 'string') {
      const cleaned = value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
      try {
        value = JSON.parse(cleaned)
      } catch (e) {
        throw new Error(`Could not parse N8N JSON response: ${(e as Error).message}`)
      }
    }

    if (Array.isArray(value)) {
      if (value.length === 0) throw new Error('N8N returned empty array')
      return value[0] as N8nWebhookResponse
    }

    if (typeof value === 'object' && value !== null) {
      return value as N8nWebhookResponse
    }

    throw new Error(`Unexpected N8N response shape: ${typeof value}`)
  }

  private extractError(error: unknown): { reason: string; detail: string } {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{ error?: { message?: string; code?: number } }>
      const httpStatus = axiosError.response?.status ?? 'no-response'
      const apiError = axiosError.response?.data?.error
      const reason = apiError?.message ?? axiosError.message
      const detail =
        `httpStatus=${httpStatus} code=${apiError?.code ?? 'n/a'} ` +
        `url=${this.webhookUrl} body=${JSON.stringify(axiosError.response?.data ?? null)}`
      return { reason, detail }
    }
    const reason = error instanceof Error ? error.message : String(error)
    return { reason, detail: `(non-axios) ${reason}` }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
