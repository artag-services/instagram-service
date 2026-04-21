"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var InstagramListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramListener = void 0;
const common_1 = require("@nestjs/common");
const rabbitmq_service_1 = require("../rabbitmq/rabbitmq.service");
const instagram_service_1 = require("./instagram.service");
const ai_response_service_1 = require("./services/ai-response.service");
const queues_1 = require("../rabbitmq/constants/queues");
const prisma_service_1 = require("../prisma/prisma.service");
const conversation_cache_service_1 = require("../conversations/conversation-cache.service");
const IDENTITY_RESOLVE_ROUTING_KEY = 'channels.identity.resolve';
let InstagramListener = InstagramListener_1 = class InstagramListener {
    constructor(rabbitmq, instagram, aiResponseService, prisma, conversationCache) {
        this.rabbitmq = rabbitmq;
        this.instagram = instagram;
        this.aiResponseService = aiResponseService;
        this.prisma = prisma;
        this.conversationCache = conversationCache;
        this.logger = new common_1.Logger(InstagramListener_1.name);
    }
    async onModuleInit() {
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_SEND, queues_1.ROUTING_KEYS.INSTAGRAM_SEND, (payload) => this.handleSendMessage(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_MESSAGE, queues_1.ROUTING_KEYS.INSTAGRAM_MESSAGE_RECEIVED, (payload) => this.handleMessageReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_COMMENT, queues_1.ROUTING_KEYS.INSTAGRAM_COMMENT_RECEIVED, (payload) => this.handleCommentReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_REACTION, queues_1.ROUTING_KEYS.INSTAGRAM_REACTION_RECEIVED, (payload) => this.handleReactionReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_SEEN, queues_1.ROUTING_KEYS.INSTAGRAM_SEEN_RECEIVED, (payload) => this.handleSeenReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_REFERRAL, queues_1.ROUTING_KEYS.INSTAGRAM_REFERRAL_RECEIVED, (payload) => this.handleReferralReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_OPTIN, queues_1.ROUTING_KEYS.INSTAGRAM_OPTIN_RECEIVED, (payload) => this.handleOptinReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_EVENTS_HANDOVER, queues_1.ROUTING_KEYS.INSTAGRAM_HANDOVER_RECEIVED, (payload) => this.handleHandoverReceived(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_AI_RESPONSE, queues_1.ROUTING_KEYS.INSTAGRAM_AI_RESPONSE, (payload) => this.handleAIResponse(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED, queues_1.ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED, (payload) => this.handleFailedChunk(payload));
        await this.rabbitmq.subscribe(queues_1.QUEUES.INSTAGRAM_AI_RESPONSE_DLQ, queues_1.ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_DLQ, (payload) => this.handleAIResponseDLQ(payload));
    }
    async handleSendMessage(payload) {
        const dto = payload;
        this.logger.log(`Processing message ${dto.messageId} → ${dto.recipients.length} recipient(s)`);
        const response = await this.instagram.sendToRecipients(dto);
        this.rabbitmq.publish(queues_1.ROUTING_KEYS.INSTAGRAM_RESPONSE, {
            messageId: response.messageId,
            status: response.status,
            sentCount: response.sentCount,
            failedCount: response.failedCount,
            errors: response.errors ?? null,
            timestamp: response.timestamp,
        });
        this.logger.log(`Message ${dto.messageId} done → status: ${response.status} | sent: ${response.sentCount} | failed: ${response.failedCount}`);
    }
    async handleMessageReceived(payload) {
        try {
            const value = payload.value;
            const senderId = value.sender?.id;
            const messageText = value.message?.text || '';
            const messageId = value.message?.mid || `msg_${Date.now()}`;
            if (!senderId) {
                this.logger.warn('Message received without sender ID');
                return;
            }
            const isEcho = value.message?.is_echo === true;
            const isSelf = value.message?.is_self === true;
            this.logger.log(`📨 Instagram message from ${senderId}${isEcho ? ' (echo)' : ''}${isSelf ? ' (self)' : ''}`);
            const profile = await this.instagram.getUserProfileWithCache(senderId);
            const displayName = profile?.displayName || senderId;
            this.logger.debug(`Resolved displayName: "${displayName}" for IGSID ${senderId}`);
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
            this.logger.log(`✅ Identity resolved for ${senderId} → displayName: "${displayName}"`);
            this.processAIResponse(senderId, displayName, messageText, messageId).catch((error) => {
                this.logger.error(`Failed to process AI response: ${error instanceof Error ? error.message : String(error)}`);
            });
        }
        catch (error) {
            this.logger.error(`Error handling Instagram message: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async processAIResponse(senderId, senderName, messageText, messageId) {
        try {
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
            let conversation = this.conversationCache.get(senderId);
            if (!conversation) {
                const dbConversation = await this.prisma.conversation.findFirst({
                    where: {
                        channelUserId: senderId,
                        channel: 'instagram',
                        status: 'ACTIVE',
                    },
                });
                if (dbConversation) {
                    conversation = {
                        id: dbConversation.id,
                        channelUserId: dbConversation.channelUserId,
                        topic: dbConversation.topic,
                        aiEnabled: dbConversation.aiEnabled,
                        userId: dbConversation.userId,
                        status: dbConversation.status,
                        agentAssigned: dbConversation.agentAssigned,
                    };
                }
            }
            if (!conversation) {
                if (!user.aiEnabled) {
                    this.logger.debug(`AI disabled globally for user ${user.id}, skipping N8N webhook`);
                    return;
                }
            }
            else {
                if (!conversation.aiEnabled) {
                    this.logger.debug(`AI disabled for conversation ${conversation.id} (agent assigned or manually disabled)`);
                    return;
                }
                if (conversation.agentAssigned) {
                    this.logger.debug(`Agent ${conversation.agentAssigned} assigned to conversation ${conversation.id}, skipping AI`);
                    return;
                }
            }
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const rateLimit = await this.prisma.n8NRateLimit.findUnique({
                where: {
                    userId_service_date: {
                        userId: user.id,
                        service: 'instagram',
                        date: today,
                    },
                },
            });
            const callsToday = rateLimit?.callCount || 0;
            if (callsToday >= 20) {
                this.logger.warn(`User ${user.id} exceeded daily AI rate limit (Instagram): ${callsToday}/20`);
                return;
            }
            this.logger.debug(`AI enabled for conversation, rate limit OK (${callsToday}/20). Calling N8N webhook`);
            const n8nResponse = await this.instagram.callN8NWebhook(user.id, senderName, senderId, messageText, messageId);
            if (!n8nResponse) {
                this.logger.warn(`N8N webhook returned null for user ${user.id}`);
                return;
            }
            if (rateLimit) {
                await this.prisma.n8NRateLimit.update({
                    where: { id: rateLimit.id },
                    data: { callCount: rateLimit.callCount + 1 },
                });
            }
            else {
                await this.prisma.n8NRateLimit.create({
                    data: {
                        userId: user.id,
                        service: 'instagram',
                        date: today,
                        callCount: 1,
                    },
                });
            }
            await this.rabbitmq.publish(queues_1.ROUTING_KEYS.INSTAGRAM_AI_RESPONSE, {
                userId: user.id,
                senderId,
                messageId,
                conversationId: conversation?.id,
                aiResponse: n8nResponse.aiResponse || 'No AI response generated',
                confidence: n8nResponse.confidence || 0,
                model: n8nResponse.model || 'unknown',
                processingTime: n8nResponse.processingTime || 0,
                timestamp: Date.now(),
            });
            this.logger.log(`AI response published for user ${user.id} | confidence: ${n8nResponse.confidence} | model: ${n8nResponse.model}`);
        }
        catch (error) {
            this.logger.error(`Error processing AI response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleCommentReceived(payload) {
        this.logger.log(`💬 Comment received event: ${JSON.stringify(payload)}`);
    }
    async handleReactionReceived(payload) {
        this.logger.log(`😊 Reaction received event: ${JSON.stringify(payload)}`);
    }
    async handleSeenReceived(payload) {
        this.logger.log(`✓ Seen received event: ${JSON.stringify(payload)}`);
    }
    async handleReferralReceived(payload) {
        this.logger.log(`🔗 Referral received event: ${JSON.stringify(payload)}`);
    }
    async handleOptinReceived(payload) {
        this.logger.log(`✋ Optin received event: ${JSON.stringify(payload)}`);
    }
    async handleHandoverReceived(payload) {
        this.logger.log(`🔄 Handover received event: ${JSON.stringify(payload)}`);
    }
    async handleAIResponse(payload) {
        try {
            const { userId, senderId, messageId, aiResponse, confidence, model, processingTime } = payload;
            const validAiResponse = aiResponse || 'No AI response generated';
            this.logger.debug(`[handleAIResponse] Processing AI response for user ${userId} | senderId: ${senderId} | length: ${validAiResponse.length}`);
            const aiResponseRecord = await this.aiResponseService.createAIResponse({
                userId,
                senderId,
                messageId,
                originalMessage: '',
                aiResponse: validAiResponse,
                model: model || 'unknown',
                confidence: confidence || 0,
                processingTime: processingTime || 0,
            });
            const chunks = this.aiResponseService.splitMessageIntoChunks(validAiResponse);
            if (chunks.length === 0) {
                this.logger.warn(`AI response is empty for user ${userId}`);
                await this.aiResponseService.sendToDLQ(aiResponseRecord.id, 'AI response is empty');
                return;
            }
            const chunkRecords = await this.aiResponseService.createChunks(aiResponseRecord.id, chunks);
            let sentCount = 0;
            let failureReason = null;
            for (const chunk of chunkRecords) {
                const result = await this.aiResponseService.sendChunkWithRetry(chunk, senderId, (recipient, message, chunkMessageId) => this.sendChunkToUser(recipient, message, chunkMessageId));
                if (result.success) {
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
                }
                else {
                    await this.rabbitmq.publish(queues_1.ROUTING_KEYS.INSTAGRAM_AI_RESPONSE_CHUNK_FAILED, {
                        chunkId: chunk.id,
                        aiResponseId: aiResponseRecord.id,
                        senderId,
                        error: result.error,
                    });
                    failureReason = result.error ?? null;
                }
            }
            const finalStatus = await this.aiResponseService.updateAIResponseStatus(aiResponseRecord.id);
            this.logger.log(`AI response processed: ${sentCount}/${chunkRecords.length} chunks sent | Status: ${finalStatus}`);
        }
        catch (error) {
            this.logger.error(`Error handling AI response: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleFailedChunk(payload) {
        try {
            const { chunkId, aiResponseId, senderId, error } = payload;
            this.logger.debug(`[handleFailedChunk] Processing failed chunk ${chunkId}`);
            await this.aiResponseService.handleFailedChunk(chunkId);
            this.logger.log(`Failed chunk ${chunkId} marked for retry or permanent failure`);
        }
        catch (error) {
            this.logger.error(`Error handling failed chunk: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async handleAIResponseDLQ(payload) {
        try {
            const { aiResponseId, userId, senderId, reason } = payload;
            this.logger.error(`[DLQ] AI Response failed permanently | aiResponseId: ${aiResponseId} | userId: ${userId} | reason: ${reason}`);
            this.logger.warn(`DLQ recorded for ${aiResponseId}: user may need manual intervention`);
        }
        catch (error) {
            this.logger.error(`Error handling DLQ: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async sendChunkToUser(recipient, message, messageId) {
        const igMessageId = await this.instagram.sendToOneWithId(messageId, recipient, message, null);
        return igMessageId;
    }
};
exports.InstagramListener = InstagramListener;
exports.InstagramListener = InstagramListener = InstagramListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [rabbitmq_service_1.RabbitMQService,
        instagram_service_1.InstagramService,
        ai_response_service_1.AIResponseService,
        prisma_service_1.PrismaService,
        conversation_cache_service_1.ConversationCacheService])
], InstagramListener);
//# sourceMappingURL=instagram.listener.js.map