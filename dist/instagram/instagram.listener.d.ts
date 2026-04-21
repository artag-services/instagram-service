import { OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { InstagramService } from './instagram.service';
import { AIResponseService } from './services/ai-response.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationCacheService } from '../conversations/conversation-cache.service';
export declare class InstagramListener implements OnModuleInit {
    private readonly rabbitmq;
    private readonly instagram;
    private readonly aiResponseService;
    private readonly prisma;
    private readonly conversationCache;
    private readonly logger;
    constructor(rabbitmq: RabbitMQService, instagram: InstagramService, aiResponseService: AIResponseService, prisma: PrismaService, conversationCache: ConversationCacheService);
    onModuleInit(): Promise<void>;
    private handleSendMessage;
    private handleMessageReceived;
    private processAIResponse;
    private handleCommentReceived;
    private handleReactionReceived;
    private handleSeenReceived;
    private handleReferralReceived;
    private handleOptinReceived;
    private handleHandoverReceived;
    private handleAIResponse;
    private handleFailedChunk;
    private handleAIResponseDLQ;
    private sendChunkToUser;
}
