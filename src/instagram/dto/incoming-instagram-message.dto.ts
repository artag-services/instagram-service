/**
 * DTO para parsear mensajes entrantes del webhook de Instagram
 * Estructura exacta del payload que envía Meta
 */
export interface IncomingInstagramMessageDto {
  sender: {
    id: string; // IGSID del remitente
  };
  recipient: {
    id: string; // IGSID del destinatario (nosotros)
  };
  timestamp: number;
  message: {
    mid: string; // Message ID único
    text?: string;
    is_self?: boolean;
    is_echo?: boolean;
  };
}
