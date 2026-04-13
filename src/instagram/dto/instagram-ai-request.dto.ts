/**
 * DTO para la solicitud que se envía a N8N
 * Formato estándar que N8N espera
 */
export interface InstagramAIRequestDto {
  userId: string;
  userName: string;
  userPhone: string; // IGSID del remitente
  channel: string; // 'instagram'
  message: string;
  messageId: string; // mid del mensaje
  timestamp: number;
}
