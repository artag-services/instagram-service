import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SendInstagramDto } from './dto/send-instagram.dto';
import { InstagramResponseDto } from './dto/instagram-response.dto';
import { v4 as uuidv4 } from 'uuid';

interface MetaApiResponse {
  recipient_id: string;
  message_id: string;
}

interface MetaApiError {
  error: { message: string; code: number };
}

interface N8NWebhookPayload {
  userId: string;
  userName: string;
  userPhone: string;
  channel: string;
  message: string;
  messageId: string;
  timestamp: number;
}

interface N8NWebhookResponse {
  userId: string;
  senderId: string;
  messageId: string;
  aiResponse: string;
  confidence?: number;
  model?: string;
  processingTime?: number;
  timestamp?: number;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);
  private readonly apiUrl: string;
  private readonly pageToken: string;
  private readonly n8nWebhookUrl: string;
  private readonly n8nWebhookTimeout: number;
  private readonly n8nWebhookRetries: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const version = config.get<string>('INSTAGRAM_API_VERSION') ?? 'v21.0';
    // Use Instagram Graph API endpoint (not Facebook Graph API)
    this.pageToken = config.getOrThrow<string>('INSTAGRAM_PAGE_TOKEN');
    this.apiUrl = `https://graph.instagram.com/${version}/me/messages`;
    this.n8nWebhookUrl = config.getOrThrow<string>('N8N_WEBHOOK_URL');
    this.n8nWebhookTimeout = config.get<number>('N8N_WEBHOOK_TIMEOUT') ?? 5000;
    this.n8nWebhookRetries = config.get<number>('N8N_WEBHOOK_RETRIES') ?? 1;
  }

  async sendToRecipients(dto: SendInstagramDto): Promise<InstagramResponseDto> {
    const results = await Promise.allSettled(
      dto.recipients.map((recipient) =>
        this.sendToOne(dto.messageId, recipient, dto.message, dto.mediaUrl),
      ),
    );

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r, i) => ({
        recipient: dto.recipients[i],
        reason: r.reason instanceof Error ? r.reason.message : String(r.reason),
      }));

    const sentCount = results.filter((r) => r.status === 'fulfilled').length;
    const failedCount = errors.length;

    return {
      messageId: dto.messageId,
      status: this.resolveStatus(sentCount, failedCount),
      sentCount,
      failedCount,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    };
  }

   private async sendToOne(
     messageId: string,
     recipient: string,
     message: string,
     mediaUrl?: string | null,
   ): Promise<void> {
      const record = await this.prisma.igMessage.create({
       data: {
         id: uuidv4(),
         messageId,
         recipient,
         body: message,
         mediaUrl: mediaUrl ?? null,
         status: 'PENDING',
       },
     });

      try {
         const payload = this.buildPayload(recipient, message, mediaUrl);
         console.log(`[INSTAGRAM] Sending to ${recipient} | URL: ${this.apiUrl}`);
         console.log(`[INSTAGRAM] Using Authorization header with pageToken`);
         const response = await axios.post<MetaApiResponse>(this.apiUrl, payload, {
           headers: { 
             'Content-Type': 'application/json',
             'Authorization': `Bearer ${this.pageToken}`,
           },
         });

        await this.prisma.igMessage.update({
          where: { id: record.id },
          data: { status: 'SENT', igMessageId: response.data.message_id, sentAt: new Date() },
        });

        this.logger.log(`Sent to ${recipient} | igMessageId: ${response.data.message_id}`);
      } catch (error) {
        const reason = this.extractError(error);
        console.error(`[INSTAGRAM_ERROR] Failed to send to ${recipient}:`, reason);
        if (axios.isAxiosError(error)) {
          console.error(`[INSTAGRAM_API_ERROR]`, {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
          });
        }

        await this.prisma.igMessage.update({
          where: { id: record.id },
          data: { status: 'FAILED', errorReason: reason },
        });

        this.logger.error(`Failed to send to ${recipient}: ${reason}`);
        throw new Error(reason);
      }
   }

  private buildPayload(recipient: string, message: string, mediaUrl?: string | null) {
    if (mediaUrl) {
      return {
        recipient: { id: recipient },
        message: {
          attachment: {
            type: 'image',
            payload: { url: mediaUrl, is_reusable: true },
          },
        },
        messaging_type: 'RESPONSE',
      };
    }

    return {
      recipient: { id: recipient },
      message: { text: message },
      messaging_type: 'RESPONSE',
    };
  }

  private resolveStatus(sent: number, failed: number): 'SENT' | 'FAILED' | 'PARTIAL' {
    if (failed === 0) return 'SENT';
    if (sent === 0) return 'FAILED';
    return 'PARTIAL';
  }

  private extractError(error: unknown): string {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<MetaApiError>;
      return axiosError.response?.data?.error?.message ?? axiosError.message;
    }
    return error instanceof Error ? error.message : String(error);
  }

   /**
    * Send a message to a single Instagram user by IGSID.
    * This is used when you already know the IGSID of the recipient.
    */
   async sendToInstagramUser(igsid: string, message: string, mediaUrl?: string): Promise<{
     messageId: string;
     igsid: string;
     status: 'SENT' | 'FAILED';
     timestamp: string;
   }> {
     const messageId = uuidv4();
     try {
       await this.sendToOne(messageId, igsid, message, mediaUrl);
       return {
         messageId,
         igsid,
         status: 'SENT',
         timestamp: new Date().toISOString(),
       };
     } catch (error) {
       return {
         messageId,
         igsid,
         status: 'FAILED',
         timestamp: new Date().toISOString(),
       };
     }
   }

   async getConversations(): Promise<Array<{ conversationId: string; igsid: string; username?: string }>> {
      try {
        const businessAccountId = this.config.get<string>('INSTAGRAM_BUSINESS_ACCOUNT_ID');
        console.log(`[INSTAGRAM] Fetching conversations for Business Account ID: ${businessAccountId}`);
        
        const url = `https://graph.facebook.com/v19.0/${businessAccountId}/conversations`;
        console.log(`[INSTAGRAM] API URL: ${url}`);
        
         const response = await axios.get(url, {
           params: {
             access_token: this.pageToken,
             fields: 'id,senders,participants,message',
             user_id: businessAccountId,
           },
         });

        console.log(`[INSTAGRAM] API Response:`, JSON.stringify(response.data));
        
        const conversations = response.data.data || [];
        const result = conversations.map((conv: any) => ({
          conversationId: conv.id,
          igsid: conv.senders?.[0]?.id || conv.id,
          username: conv.senders?.[0]?.name,
        }));
        
        console.log(`[INSTAGRAM] Returning ${result.length} conversations`);
        return result;
      } catch (error) {
        const errorMsg = this.extractError(error);
        console.error(`[INSTAGRAM_ERROR] Failed to fetch conversations:`, errorMsg);
        this.logger.error(`Failed to fetch conversations: ${errorMsg}`);
        throw error;
      }
    }

    /**
     * Fetch user profile from BD cache first, fallback to Graph API
     * Reduces API calls and improves performance for repeat messages
     */
    async getUserProfileWithCache(igsid: string): Promise<{
      displayName?: string;
      username?: string;
    }> {
      try {
        // 📌 PASO 1: Buscar en BD primero (caché)
        const existingIdentity = await this.prisma.userIdentity.findUnique({
          where: {
            channelUserId_channel: {
              channelUserId: igsid,
              channel: 'instagram',
            },
          },
        });

        // Si encontramos y tiene displayName, usarlo (cache hit)
        if (existingIdentity?.displayName) {
          this.logger.debug(
            `✅ Cache HIT: Found displayName in BD for IGSID ${igsid}: "${existingIdentity.displayName}"`
          );
          
          // Extraer username del metadata si existe
          const username = (existingIdentity.metadata as any)?.username;
          return {
            displayName: existingIdentity.displayName,
            username,
          };
        }

        // 📌 PASO 2: Si no está en BD o no tiene displayName, consultar Graph API
        this.logger.debug(
          `Cache MISS: Not found in BD or no displayName, querying Graph API for IGSID ${igsid}`
        );
        const apiProfile = await this.fetchUserProfileFromGraphApi(igsid);
        return apiProfile;

      } catch (error) {
        this.logger.error(
          `Error in getUserProfileWithCache: ${error instanceof Error ? error.message : String(error)}`
        );
        return {}; // Fallback vacío, usará IGSID en listener
      }
    }

     /**
      * Fetch user profile from Instagram Graph API
      * GET /v25.0/{IGSID}?fields=username,name&access_token=TOKEN
      */
     private async fetchUserProfileFromGraphApi(igsid: string): Promise<{
       displayName?: string;
       username?: string;
     }> {
       try {
         const version = this.config.get<string>('INSTAGRAM_API_VERSION') ?? 'v25.0';
         const url = `https://graph.instagram.com/${version}/${igsid}`;

         this.logger.debug(`Fetching Instagram profile from Graph API: ${url}`);

         const response = await axios.get(url, {
           params: {
             fields: 'username,name',
             access_token: this.pageToken,
           },
         });

         const profileData = response.data;
         const displayName = profileData.name || profileData.username;

         this.logger.debug(
           `✅ Graph API response for ${igsid}: name="${profileData.name}" username="${profileData.username}"`
         );

         return {
           displayName,
           username: profileData.username,
         };
       } catch (error) {
         this.logger.warn(
           `Could not fetch profile from Graph API for IGSID ${igsid}: ${error instanceof Error ? error.message : String(error)}`
         );
         return {}; // Fallback, usará IGSID en listener
       }
     }

  // ─────────────────────────────────────────
  // N8N Webhook Integration
  // ─────────────────────────────────────────

  /**
   * Call N8N webhook to generate AI response for a message
   * @param userId - User ID
   * @param userName - User's display name
   * @param userPhone - User's phone number (IGSID for Instagram)
   * @param message - The incoming message text
   * @param messageId - Unique message identifier
   * @returns N8N webhook response or null if error/rate limited
   */
  async callN8NWebhook(
    userId: string,
    userName: string,
    userPhone: string,
    message: string,
    messageId: string,
  ): Promise<N8NWebhookResponse | null> {
    return this.callN8NWebhookWithRetry(
      userId,
      userName,
      userPhone,
      message,
      messageId,
      0,
    );
  }

  /**
   * Call N8N webhook with automatic retries on failure
   * @param userId - User ID
   * @param userName - User's display name
   * @param userPhone - User's phone number (IGSID for Instagram)
   * @param message - The incoming message text
   * @param messageId - Unique message identifier
   * @param attemptNumber - Current attempt number (for recursion)
   * @returns N8N webhook response or null if failed after all retries
   */
  private async callN8NWebhookWithRetry(
    userId: string,
    userName: string,
    userPhone: string,
    message: string,
    messageId: string,
    attemptNumber: number,
  ): Promise<N8NWebhookResponse | null> {
    const maxRetries = this.n8nWebhookRetries;
    const currentAttempt = attemptNumber + 1;

    try {
      const payload: N8NWebhookPayload = {
        userId,
        userName,
        userPhone,
        channel: 'instagram',
        message,
        messageId,
        timestamp: Date.now(),
      };

      this.logger.debug(
        `[callN8NWebhook] Attempt ${currentAttempt}/${maxRetries + 1} → URL: ${this.n8nWebhookUrl} | userId: ${userId} | messageId: ${messageId}`,
      );

      const response = await axios.post<N8NWebhookResponse[] | N8NWebhookResponse>(
        this.n8nWebhookUrl,
        payload,
        {
          timeout: this.n8nWebhookTimeout,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      // Log detailed response info for debugging
      this.logger.debug(
        `[callN8NWebhook] Raw response received:
        - response exists: ${!!response}
        - response.data exists: ${!!response.data}
        - response.data type: ${typeof response.data}
        - response.data is array: ${Array.isArray(response.data)}
        - response.data: ${JSON.stringify(response.data).substring(0, 500)}...`,
      );

       // N8N can return in different formats:
       // 1. Array: [{...}] (test mode)
       // 2. Object: {...} (live mode)
       // 3. String JSON: "{...}" (axios returns response.data as string sometimes)
       let aiResponseData: N8NWebhookResponse;

       if (Array.isArray(response.data)) {
         // Test mode: array format
         if (response.data.length === 0) {
           throw new Error('N8N webhook returned empty array');
         }
         aiResponseData = response.data[0];
         this.logger.debug(`[callN8NWebhook] Extracted from array format (length: ${response.data.length})`);
        } else if (typeof response.data === 'string') {
          // String JSON format: parse it first
          try {
            // Clean up the string: remove literal newlines and extra whitespace
            // that might cause JSON parsing errors
            const dataStr = response.data as string;
            const cleanedString = dataStr
              .replace(/\r\n/g, ' ')  // Replace Windows line endings
              .replace(/\n/g, ' ')    // Replace Unix line endings
              .replace(/\r/g, ' ')    // Replace Mac line endings
              .replace(/\t/g, ' ')    // Replace tabs
              .replace(/\s+/g, ' ')   // Collapse multiple spaces
              .trim();
            
            const parsed = JSON.parse(cleanedString);
            if (Array.isArray(parsed)) {
              if (parsed.length === 0) {
                throw new Error('N8N webhook returned empty array (after parsing)');
              }
              aiResponseData = parsed[0];
              this.logger.debug(`[callN8NWebhook] Extracted from parsed array format (length: ${parsed.length})`);
            } else if (typeof parsed === 'object' && parsed !== null) {
              aiResponseData = parsed as N8NWebhookResponse;
              this.logger.debug(`[callN8NWebhook] Received parsed object format`);
            } else {
              throw new Error(`N8N webhook returned invalid format after parsing: ${typeof parsed}`);
            }
          } catch (parseError) {
            throw new Error(`Failed to parse N8N response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
          }
        } else if (typeof response.data === 'object' && response.data !== null) {
         // Live mode: object format
         aiResponseData = response.data as N8NWebhookResponse;
         this.logger.debug(`[callN8NWebhook] Received object format (direct response)`);
       } else {
         throw new Error(`N8N webhook returned invalid format: ${typeof response.data}`);
       }

      // Validate required fields
      if (!aiResponseData.aiResponse) {
        throw new Error('N8N response missing aiResponse field');
      }

      this.logger.log(
        `[callN8NWebhook] Success → userId: ${aiResponseData.userId} | aiResponse length: ${aiResponseData.aiResponse?.length || 0} | confidence: ${aiResponseData.confidence} | model: ${aiResponseData.model}`,
      );

      return aiResponseData;
    } catch (error) {
      const { reason, detail, errorCode } = this.extractErrorDetail(error);

      this.logger.debug(
        `[callN8NWebhook] Error details: ${detail}`,
      );

      if (currentAttempt <= maxRetries) {
        this.logger.warn(
          `[callN8NWebhook] Attempt ${currentAttempt}/${maxRetries + 1} failed (code: ${errorCode}): ${reason}. Retrying...`,
        );
        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.callN8NWebhookWithRetry(
          userId,
          userName,
          userPhone,
          message,
          messageId,
          attemptNumber + 1,
        );
      } else {
        this.logger.error(
          `[callN8NWebhook] Failed after ${maxRetries + 1} attempts → userId: ${userId} | errorCode: ${errorCode} | reason: ${reason}`,
        );
        this.logger.error(`[callN8NWebhook] Full error details:\n${detail}`);
        return null;
      }
    }
  }

  /**
   * Enhanced error extraction with details for debugging
   */
  private extractErrorDetail(error: unknown): { reason: string; detail: string; errorCode?: number } {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      const httpStatus = axiosError.response?.status ?? 'no-response';
      const metaError = axiosError.response?.data?.error;

      const reason = metaError?.message ?? axiosError.message;
      const errorCode = metaError?.code;
      const detail =
        `httpStatus: ${httpStatus}\n` +
        `  errorCode : ${metaError?.code ?? 'n/a'}\n` +
        `  message  : ${metaError?.message ?? 'n/a'}\n` +
        `  apiUrl   : ${this.n8nWebhookUrl}\n` +
        `  rawBody  : ${JSON.stringify(axiosError.response?.data ?? null)}`;

      return { reason, detail, errorCode };
    }

    const reason = error instanceof Error ? error.message : String(error);
    return { reason, detail: `(non-axios error) ${reason}` };
  }

  /**
   * Send a message to a single Instagram user (from AIResponseService)
   * Returns igMessageId for tracking
   */
  async sendToOneWithId(
    messageId: string,
    recipient: string,
    message: string,
    mediaUrl?: string | null,
  ): Promise<string> {
    const record = await this.prisma.igMessage.create({
      data: {
        id: uuidv4(),
        messageId,
        recipient,
        body: message,
        mediaUrl: mediaUrl ?? null,
        status: 'PENDING',
      },
    });

    try {
      const payload = this.buildPayload(recipient, message, mediaUrl);

      this.logger.debug(
        `[sendToOneWithId] Calling Instagram API → URL: ${this.apiUrl} | recipient: ${recipient}`,
      );

      const response = await axios.post<MetaApiResponse>(this.apiUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.pageToken}`,
        },
      });

      const igMessageId = response.data.message_id;

      await this.prisma.igMessage.update({
        where: { id: record.id },
        data: { status: 'SENT', igMessageId, sentAt: new Date() },
      });

      this.logger.log(`Sent to ${recipient} | igMessageId: ${igMessageId}`);
      return igMessageId;
    } catch (error) {
      const reason = this.extractError(error);

      this.logger.warn(
        `Failed to send message to ${recipient}: ${reason}.`,
      );

      await this.prisma.igMessage.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          errorReason: reason,
        },
      });

      this.logger.error(`Failed to send message to ${recipient}: ${reason}`);
      throw new Error(reason);
    }
  }
}
