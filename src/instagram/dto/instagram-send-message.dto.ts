/**
 * DTO para enviar mensajes a través de Instagram API
 * Formato que espera Meta API en /v21.0/me/messages
 */
export interface InstagramSendMessageDto {
  recipient: {
    id: string; // IGSID del destinatario
  };
  messaging_type: string; // 'RESPONSE'
  message: {
    text: string;
  };
}
