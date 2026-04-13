import { Injectable, Logger } from '@nestjs/common';
import { IncomingInstagramMessageDto } from '../dto/incoming-instagram-message.dto';
import { InstagramAIRequestDto } from '../dto/instagram-ai-request.dto';
import { InstagramAIResponseDto } from '../dto/instagram-ai-response.dto';
import { InstagramSendMessageDto } from '../dto/instagram-send-message.dto';

/**
 * Servicio de transformación de datos para Instagram AI
 * Mapea datos de entrada (Instagram) a formato N8N
 * Mapea datos de salida (N8N) a formato Instagram API
 */
@Injectable()
export class AIResponseTransformerService {
  private readonly logger = new Logger(AIResponseTransformerService.name);

  /**
   * Transforma mensaje entrante de Instagram a formato que N8N espera
   * @param instagramMessage Mensaje parseado del webhook de Instagram
   * @param userId ID del usuario (resuelto desde BD)
   * @param userName Nombre del usuario (resuelto desde cache)
   * @returns Objeto en formato que N8N espera
   */
  transformIncomingToN8N(
    instagramMessage: IncomingInstagramMessageDto,
    userId: string,
    userName: string,
  ): InstagramAIRequestDto {
    const n8nRequest: InstagramAIRequestDto = {
      userId,
      userName,
      userPhone: instagramMessage.sender.id, // IGSID del remitente
      channel: 'instagram',
      message: instagramMessage.message.text || '',
      messageId: instagramMessage.message.mid,
      timestamp: instagramMessage.timestamp,
    };

    this.logger.debug(
      `[transformIncomingToN8N] Transformed Instagram message:
      - userId: ${userId}
      - userName: ${userName}
      - senderId (IGSID): ${instagramMessage.sender.id}
      - messageId: ${instagramMessage.message.mid}
      - message length: ${instagramMessage.message.text?.length || 0}`,
    );

    return n8nRequest;
  }

  /**
   * Transforma respuesta de N8N a formato que Instagram API espera
   * @param n8nResponse Respuesta de N8N con la IA generada
   * @returns Objeto en formato que Instagram API espera
   */
  transformN8NResponseToInstagram(
    n8nResponse: InstagramAIResponseDto,
  ): InstagramSendMessageDto {
    const instagramMessage: InstagramSendMessageDto = {
      recipient: {
        id: n8nResponse.senderId, // IGSID del remitente (para responder)
      },
      messaging_type: 'RESPONSE',
      message: {
        text: n8nResponse.aiResponse,
      },
    };

    this.logger.debug(
      `[transformN8NResponseToInstagram] Transformed N8N response:
      - senderId (recipient IGSID): ${n8nResponse.senderId}
      - aiResponse length: ${n8nResponse.aiResponse?.length || 0}
      - confidence: ${n8nResponse.confidence}
      - model: ${n8nResponse.model}`,
    );

    return instagramMessage;
  }
}
