import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { SendInstagramDto } from './dto/send-instagram.dto';
import { InstagramResponseDto } from './dto/instagram-response.dto';
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
export declare class InstagramService {
    private readonly prisma;
    private readonly config;
    private readonly logger;
    private readonly apiUrl;
    private readonly pageToken;
    private readonly n8nWebhookUrl;
    private readonly n8nWebhookTimeout;
    private readonly n8nWebhookRetries;
    constructor(prisma: PrismaService, config: ConfigService);
    sendToRecipients(dto: SendInstagramDto): Promise<InstagramResponseDto>;
    private sendToOne;
    private buildPayload;
    private resolveStatus;
    private extractError;
    sendToInstagramUser(igsid: string, message: string, mediaUrl?: string): Promise<{
        messageId: string;
        igsid: string;
        status: 'SENT' | 'FAILED';
        timestamp: string;
    }>;
    getConversations(): Promise<Array<{
        conversationId: string;
        igsid: string;
        username?: string;
    }>>;
    getUserProfileWithCache(igsid: string): Promise<{
        displayName?: string;
        username?: string;
    }>;
    private fetchUserProfileFromGraphApi;
    callN8NWebhook(userId: string, userName: string, userPhone: string, message: string, messageId: string): Promise<N8NWebhookResponse | null>;
    private callN8NWebhookWithRetry;
    private extractErrorDetail;
    sendToOneWithId(messageId: string, recipient: string, message: string, mediaUrl?: string | null): Promise<string>;
}
export {};
