import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { InstagramService } from './instagram.service';
import { AIResponseService } from './services/ai-response.service';
import { ROUTING_KEYS, QUEUES } from '../rabbitmq/constants/queues';
import { SendInstagramDto } from './dto/send-instagram.dto';
import { PrismaService } from '../prisma/prisma.service';

// Identity service routing keys
const IDENTITY_RESOLVE_ROUTING_KEY = 'channels.identity.resolve';

@Injectable()
export class InstagramListener implements OnModuleInit {
  private readonly logger = new Logger(InstagramListener.name);

  constructor(
    private readonly rabbitmq: RabbitMQService,
    private readonly instagram: InstagramService,
    private readonly aiResponseService: AIResponseService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // Listen to outgoing messages
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_SEND,
      ROUTING_KEYS.INSTAGRAM_SEND,
      (payload) => this.handleSendMessage(payload),
    );

    // Listen to incoming events
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_MESSAGE,
      ROUTING_KEYS.INSTAGRAM_MESSAGE_RECEIVED,
      (payload) => this.handleMessageReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_COMMENT,
      ROUTING_KEYS.INSTAGRAM_COMMENT_RECEIVED,
      (payload) => this.handleCommentReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REACTION,
      ROUTING_KEYS.INSTAGRAM_REACTION_RECEIVED,
      (payload) => this.handleReactionReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_SEEN,
      ROUTING_KEYS.INSTAGRAM_SEEN_RECEIVED,
      (payload) => this.handleSeenReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_REFERRAL,
      ROUTING_KEYS.INSTAGRAM_REFERRAL_RECEIVED,
      (payload) => this.handleReferralReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_OPTIN,
      ROUTING_KEYS.INSTAGRAM_OPTIN_RECEIVED,
      (payload) => this.handleOptinReceived(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_EVENTS_HANDOVER,
      ROUTING_KEYS.INSTAGRAM_HANDOVER_RECEIVED,
      (payload) => this.handleHandoverReceived(payload),
    );

    // AI Response listeners
    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE,
      (payload) => this.handleAIResponse(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED,
      (payload) => this.handleFailedChunk(payload),
    );

    await this.rabbitmq.subscribe(
      QUEUES.INSTAGRAM_AI_RESPONSE_DLQ,
      ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_DLQ,
      (payload) => this.handleAIResponseDLQ(payload),
    );
  }

  // ─────────────────────────────────────────
  // Outgoing Message Handler
  // ─────────────────────────────────────────

  private async handleSendMessage(payload: Record<string, unknown>): Promise<void> {
    const dto = payload as unknown as SendInstagramDto;

    this.logger.log(
      `Processing message ${dto.messageId} → ${dto.recipients.length} recipient(s)`,
    );

    const response = await this.instagram.sendToRecipients(dto);

    this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_RESPONSE, {
      messageId: response.messageId,
      status: response.status,
      sentCount: response.sentCount,
      failedCount: response.failedCount,
      errors: response.errors ?? null,
      timestamp: response.timestamp,
    });

    this.logger.log(
      `Message ${dto.messageId} done → status: ${response.status} | sent: ${response.sentCount} | failed: ${response.failedCount}`,
    );
  }

  // ─────────────────────────────────────────
  // Incoming Event Handlers
  // ─────────────────────────────────────────

  private async handleMessageReceived(payload: Record<string, unknown>): Promise<void> {
    try {
      const value = payload.value as any;
      const senderId = value.sender?.id;
      const messageText = value.message?.text || '';
      const messageId = value.message?.mid || `msg_${Date.now()}`;

      if (!senderId) {
        this.logger.warn('Message received without sender ID');
        return;
      }

      // Extraer información adicional del webhook
      const isEcho = value.message?.is_echo === true;
      const isSelf = value.message?.is_self === true;

      this.logger.log(
        `📨 Instagram message from ${senderId}${isEcho ? ' (echo)' : ''}${isSelf ? ' (self)' : ''}`
      );

      // 📌 PASO 1: Consultar perfil del usuario (con caché en BD)
      const profile = await this.instagram.getUserProfileWithCache(senderId);

      // 📌 PASO 2: Determinar displayName con fallbacks
      const displayName = profile?.displayName || senderId;

      this.logger.debug(
        `Resolved displayName: "${displayName}" for IGSID ${senderId}`
      );

      // 📌 PASO 3: Publicar evento de resolución de identidad
      await this.rabbitmq.publish(IDENTITY_RESOLVE_ROUTING_KEY, {
        channel: 'instagram',
        channelUserId: senderId,
        displayName,
        username: profile?.username,
        avatarUrl: null,
        metadata: {
          igsid: senderId,
          timestamp: value.timestamp,
          isEcho,
          isSelf,
          messageId,
          messageText,
        },
      });

      this.logger.log(
        `✅ Identity resolved for ${senderId} → displayName: "${displayName}"`
      );

      // 📌 PASO 4: Process AI response if enabled (fire-and-forget)
      this.processAIResponse(senderId, displayName, messageText, messageId).catch(
        (error) => {
          this.logger.error(
            `Failed to process AI response: ${error instanceof Error ? error.message : String(error)}`,
          );
        },
      );
    } catch (error) {
      this.logger.error(
        `Error handling Instagram message: ${error instanceof Error ? error.message : String(error)}`
      );
      // No relanzar error para no bloquear el flujo
    }
  }

  /**
   * Process AI response for incoming message
   * Checks if user has AI enabled, rate limit, then calls N8N webhook
   */
  private async processAIResponse(
    senderId: string,
    senderName: string,
    messageText: string,
    messageId: string,
  ): Promise<void> {
    try {
      // Find user by their Instagram identity
      const userIdentity = await this.prisma.userIdentity.findUnique({
        where: {
          channelUserId_channel: {
            channelUserId: senderId,
            channel: 'instagram',
          },
        },
        include: {
          user: true,
        },
      });

      if (!userIdentity) {
        this.logger.debug(`User identity not found for ${senderId}, skipping AI response`);
        return;
      }

      const user = userIdentity.user;

      // Check if AI is enabled for this user
      if (!user.aiEnabled) {
        this.logger.debug(`AI disabled for user ${user.id}, skipping N8N webhook`);
        return;
      }

      // Check daily rate limit (20 calls/day per user)
      const hasCapacity = await this.aiResponseService.checkDailyRateLimit(user.id);
      if (!hasCapacity) {
        this.logger.warn(
          `User ${user.id} exceeded daily AI rate limit (20/day). Skipping N8N webhook.`,
        );
        return;
      }

      this.logger.debug(`AI enabled for user ${user.id}, rate limit OK. Calling N8N webhook`);

      // Call N8N webhook to generate AI response
      const n8nResponse = await this.instagram.callN8NWebhook(
        user.id,
        senderName,
        senderId, // userPhone = IGSID for Instagram
        messageText,
        messageId,
      );

      if (!n8nResponse) {
        this.logger.warn(`N8N webhook returned null for user ${user.id}`);
        return;
      }

      // N8N returned a valid response with aiResponse text
      // Publish AI response event for further processing
      await this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_AI_RESPONSE, {
        userId: user.id,
        senderId,
        messageId,
        aiResponse: n8nResponse.aiResponse || 'No AI response generated',
        confidence: n8nResponse.confidence || 0,
        model: n8nResponse.model || 'unknown',
        processingTime: n8nResponse.processingTime || 0,
        timestamp: Date.now(),
      });

      this.logger.log(
        `AI response published for user ${user.id} | confidence: ${n8nResponse.confidence} | model: ${n8nResponse.model}`,
      );
    } catch (error) {
      this.logger.error(
        `Error processing AI response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleCommentReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`💬 Comment received event: ${JSON.stringify(payload)}`);
    // TODO: Implement comment handling logic
  }

  private async handleReactionReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`😊 Reaction received event: ${JSON.stringify(payload)}`);
    // TODO: Implement reaction handling logic
  }

  private async handleSeenReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`✓ Seen received event: ${JSON.stringify(payload)}`);
    // TODO: Implement seen handling logic
  }

  private async handleReferralReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`🔗 Referral received event: ${JSON.stringify(payload)}`);
    // TODO: Implement referral handling logic
  }

  private async handleOptinReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`✋ Optin received event: ${JSON.stringify(payload)}`);
    // TODO: Implement optin handling logic
  }

  private async handleHandoverReceived(payload: Record<string, unknown>): Promise<void> {
    this.logger.log(`🔄 Handover received event: ${JSON.stringify(payload)}`);
    // TODO: Implement handover handling logic
  }

  // ─────────────────────────────────────────
  // AI Response Handlers
  // ─────────────────────────────────────────

  /**
   * Manejar respuesta de IA: dividir en chunks, enviar al usuario
   */
  private async handleAIResponse(payload: Record<string, unknown>): Promise<void> {
    try {
      const { userId, senderId, messageId, aiResponse, confidence, model, processingTime } =
        payload as any;

      // Asegurar que aiResponse no esté vacío
      const validAiResponse = aiResponse || 'No AI response generated';

      this.logger.debug(
        `[handleAIResponse] Processing AI response for user ${userId} | senderId: ${senderId} | length: ${validAiResponse.length}`,
      );

      // 1. Crear registro de auditoría
      const aiResponseRecord = await this.aiResponseService.createAIResponse({
        userId,
        senderId,
        messageId,
        originalMessage: '', // No tenemos el original aquí, pero lo guardamos
        aiResponse: validAiResponse,
        model: model || 'unknown',
        confidence: confidence || 0,
        processingTime: processingTime || 0,
      });

      // 2. Dividir mensaje en chunks (con numeración)
      const chunks = this.aiResponseService.splitMessageIntoChunks(validAiResponse);

      if (chunks.length === 0) {
        this.logger.warn(`AI response is empty for user ${userId}`);
        await this.aiResponseService.sendToDLQ(
          aiResponseRecord.id,
          'AI response is empty',
        );
        return;
      }

      // 3. Crear registros de chunks
      const chunkRecords = await this.aiResponseService.createChunks(
        aiResponseRecord.id,
        chunks,
      );

      // 4. Enviar cada chunk (con reintentos internos)
      let sentCount = 0;
      let failureReason: string | null = null;

      for (const chunk of chunkRecords) {
        const result = await this.aiResponseService.sendChunkWithRetry(
          chunk,
          senderId,
          (recipient, message, chunkMessageId) =>
            this.sendChunkToUser(recipient, message, chunkMessageId),
        );

        if (result.success) {
          // Actualizar chunk a SENT
          await this.prisma.aIResponseChunk.update({
            where: { id: chunk.id },
            data: {
              status: 'SENT',
              externalMessageId: result.externalMessageId,
              channel: result.channel,
              sentAt: new Date(),
            },
          });
          sentCount++;
        } else {
          // Publicar evento de chunk fallido para retry
          await this.rabbitmq.publish(ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED, {
            chunkId: chunk.id,
            aiResponseId: aiResponseRecord.id,
            senderId,
            error: result.error,
          });
          failureReason = result.error ?? null;
        }
      }

      // 5. Actualizar estado del AIResponse
      const finalStatus = await this.aiResponseService.updateAIResponseStatus(
        aiResponseRecord.id,
      );

      this.logger.log(
        `AI response processed: ${sentCount}/${chunkRecords.length} chunks sent | Status: ${finalStatus}`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling AI response: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Manejar fallo de chunk individual (para retry)
   */
  private async handleFailedChunk(payload: Record<string, unknown>): Promise<void> {
    try {
      const { chunkId, aiResponseId, senderId, error } = payload as any;

      this.logger.debug(`[handleFailedChunk] Processing failed chunk ${chunkId}`);

      // Manejar retry del chunk fallido
      await this.aiResponseService.handleFailedChunk(chunkId);

      this.logger.log(`Failed chunk ${chunkId} marked for retry or permanent failure`);
    } catch (error) {
      this.logger.error(
        `Error handling failed chunk: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Manejar errores no recuperables (Dead Letter Queue)
   */
  private async handleAIResponseDLQ(payload: Record<string, unknown>): Promise<void> {
    try {
      const { aiResponseId, userId, senderId, reason } = payload as any;

      this.logger.error(
        `[DLQ] AI Response failed permanently | aiResponseId: ${aiResponseId} | userId: ${userId} | reason: ${reason}`,
      );

      // Aquí puedes agregar lógica adicional como:
      // - Notificar a admin
      // - Enviar mensaje de error al usuario
      // - Guardar en tabla de errores para análisis
      // - Alertas en Slack, etc.

      // Por ahora, solo loguear
      this.logger.warn(
        `DLQ recorded for ${aiResponseId}: user may need manual intervention`,
      );
    } catch (error) {
      this.logger.error(
        `Error handling DLQ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Enviar un chunk al usuario (wrapper)
   * Wrapper alrededor de sendToOneWithId() del InstagramService
   * @param recipient - IGSID destino
   * @param message - Mensaje/chunk a enviar
   * @param messageId - ID único del mensaje (para auditoría)
   * @returns igMessageId del mensaje enviado
   */
  private async sendChunkToUser(
    recipient: string,
    message: string,
    messageId: string,
  ): Promise<string> {
    const igMessageId = await this.instagram.sendToOneWithId(
      messageId,
      recipient,
      message,
      null, // Sin media URL para chunks de texto de IA
    );
    return igMessageId;
  }
}
