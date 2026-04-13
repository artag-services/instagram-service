/**
 * DTO para la respuesta que retorna N8N
 * Formato que N8N devuelve (objeto o array con un elemento)
 */
export interface InstagramAIResponseDto {
  userId: string;
  senderId: string; // IGSID del remitente (quien recibió el mensaje)
  messageId: string; // mid del mensaje original
  aiResponse: string;
  confidence?: number;
  model?: string;
  processingTime?: number;
  timestamp?: number;
}
