/**
 * N8N webhook payload + response shapes.
 */
export interface N8nWebhookRequest {
  userId: string
  userName: string
  userPhone: string
  channel: 'instagram' | 'whatsapp' | string
  message: string
  messageId: string
  timestamp: number
}

export interface N8nWebhookResponse {
  userId: string
  senderId: string
  messageId: string
  aiResponse: string
  confidence?: number
  model?: string
  processingTime?: number
  timestamp?: number
}
