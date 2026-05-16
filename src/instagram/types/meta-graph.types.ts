/**
 * Typed shapes for Meta Instagram Graph API responses + N8N webhook responses.
 * Replaces the `as any` casts scattered across the service/listener.
 */

// ─── Meta Graph API: send message ───
export interface MetaGraphSendResponse {
  recipient_id: string
  message_id: string
}

export interface MetaGraphError {
  error: {
    message: string
    type?: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

// ─── Meta Graph API: profile lookup ───
export interface MetaGraphProfileResponse {
  name?: string
  username?: string
  id?: string
}

// ─── Meta Graph API: conversations list ───
export interface MetaGraphConversationsResponse {
  data: Array<{
    id: string
    senders?: {
      data?: Array<{ id: string; name?: string }>
    } | Array<{ id: string; name?: string }>
    participants?: {
      data?: Array<{ id: string; name?: string }>
    }
  }>
}

// ─── Webhook payloads (from gateway via RabbitMQ) ───
export interface InstagramMessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  timestamp?: number
  message?: {
    mid: string
    text?: string
    is_echo?: boolean
    is_self?: boolean
    attachments?: Array<{ type: string; payload: { url: string } }>
  }
  delivery?: { mids: string[]; watermark: number }
  read?: { watermark: number }
}

/** Meta error codes worth treating specially */
export const META_GRAPH_ERROR_CODES = {
  RE_ENGAGEMENT_REQUIRED: 10, // outside the 24h window
} as const
