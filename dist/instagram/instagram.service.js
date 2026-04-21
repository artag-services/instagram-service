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
var InstagramService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
const prisma_service_1 = require("../prisma/prisma.service");
const uuid_1 = require("uuid");
let InstagramService = InstagramService_1 = class InstagramService {
    constructor(prisma, config) {
        this.prisma = prisma;
        this.config = config;
        this.logger = new common_1.Logger(InstagramService_1.name);
        const version = config.get('INSTAGRAM_API_VERSION') ?? 'v21.0';
        this.pageToken = config.getOrThrow('INSTAGRAM_PAGE_TOKEN');
        this.apiUrl = `https://graph.instagram.com/${version}/me/messages`;
        this.n8nWebhookUrl = config.getOrThrow('N8N_WEBHOOK_URL');
        this.n8nWebhookTimeout = config.get('N8N_WEBHOOK_TIMEOUT') ?? 5000;
        this.n8nWebhookRetries = config.get('N8N_WEBHOOK_RETRIES') ?? 1;
    }
    async sendToRecipients(dto) {
        const results = await Promise.allSettled(dto.recipients.map((recipient) => this.sendToOne(dto.messageId, recipient, dto.message, dto.mediaUrl)));
        const errors = results
            .filter((r) => r.status === 'rejected')
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
    async sendToOne(messageId, recipient, message, mediaUrl) {
        const record = await this.prisma.igMessage.create({
            data: {
                id: (0, uuid_1.v4)(),
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
            const response = await axios_1.default.post(this.apiUrl, payload, {
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
        }
        catch (error) {
            const reason = this.extractError(error);
            console.error(`[INSTAGRAM_ERROR] Failed to send to ${recipient}:`, reason);
            if (axios_1.default.isAxiosError(error)) {
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
    buildPayload(recipient, message, mediaUrl) {
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
    resolveStatus(sent, failed) {
        if (failed === 0)
            return 'SENT';
        if (sent === 0)
            return 'FAILED';
        return 'PARTIAL';
    }
    extractError(error) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            return axiosError.response?.data?.error?.message ?? axiosError.message;
        }
        return error instanceof Error ? error.message : String(error);
    }
    async sendToInstagramUser(igsid, message, mediaUrl) {
        const messageId = (0, uuid_1.v4)();
        try {
            await this.sendToOne(messageId, igsid, message, mediaUrl);
            return {
                messageId,
                igsid,
                status: 'SENT',
                timestamp: new Date().toISOString(),
            };
        }
        catch (error) {
            return {
                messageId,
                igsid,
                status: 'FAILED',
                timestamp: new Date().toISOString(),
            };
        }
    }
    async getConversations() {
        try {
            const businessAccountId = this.config.get('INSTAGRAM_BUSINESS_ACCOUNT_ID');
            console.log(`[INSTAGRAM] Fetching conversations for Business Account ID: ${businessAccountId}`);
            const url = `https://graph.facebook.com/v19.0/${businessAccountId}/conversations`;
            console.log(`[INSTAGRAM] API URL: ${url}`);
            const response = await axios_1.default.get(url, {
                params: {
                    access_token: this.pageToken,
                    fields: 'id,senders,participants,message',
                    user_id: businessAccountId,
                },
            });
            console.log(`[INSTAGRAM] API Response:`, JSON.stringify(response.data));
            const conversations = response.data.data || [];
            const result = conversations.map((conv) => ({
                conversationId: conv.id,
                igsid: conv.senders?.[0]?.id || conv.id,
                username: conv.senders?.[0]?.name,
            }));
            console.log(`[INSTAGRAM] Returning ${result.length} conversations`);
            return result;
        }
        catch (error) {
            const errorMsg = this.extractError(error);
            console.error(`[INSTAGRAM_ERROR] Failed to fetch conversations:`, errorMsg);
            this.logger.error(`Failed to fetch conversations: ${errorMsg}`);
            throw error;
        }
    }
    async getUserProfileWithCache(igsid) {
        try {
            const existingIdentity = await this.prisma.userIdentity.findUnique({
                where: {
                    channelUserId_channel: {
                        channelUserId: igsid,
                        channel: 'instagram',
                    },
                },
            });
            if (existingIdentity?.displayName) {
                this.logger.debug(`✅ Cache HIT: Found displayName in BD for IGSID ${igsid}: "${existingIdentity.displayName}"`);
                const username = existingIdentity.metadata?.username;
                return {
                    displayName: existingIdentity.displayName,
                    username,
                };
            }
            this.logger.debug(`Cache MISS: Not found in BD or no displayName, querying Graph API for IGSID ${igsid}`);
            const apiProfile = await this.fetchUserProfileFromGraphApi(igsid);
            return apiProfile;
        }
        catch (error) {
            this.logger.error(`Error in getUserProfileWithCache: ${error instanceof Error ? error.message : String(error)}`);
            return {};
        }
    }
    async fetchUserProfileFromGraphApi(igsid) {
        try {
            const version = this.config.get('INSTAGRAM_API_VERSION') ?? 'v25.0';
            const url = `https://graph.instagram.com/${version}/${igsid}`;
            this.logger.debug(`Fetching Instagram profile from Graph API: ${url}`);
            const response = await axios_1.default.get(url, {
                params: {
                    fields: 'username,name',
                    access_token: this.pageToken,
                },
            });
            const profileData = response.data;
            const displayName = profileData.name || profileData.username;
            this.logger.debug(`✅ Graph API response for ${igsid}: name="${profileData.name}" username="${profileData.username}"`);
            return {
                displayName,
                username: profileData.username,
            };
        }
        catch (error) {
            this.logger.warn(`Could not fetch profile from Graph API for IGSID ${igsid}: ${error instanceof Error ? error.message : String(error)}`);
            return {};
        }
    }
    async callN8NWebhook(userId, userName, userPhone, message, messageId) {
        return this.callN8NWebhookWithRetry(userId, userName, userPhone, message, messageId, 0);
    }
    async callN8NWebhookWithRetry(userId, userName, userPhone, message, messageId, attemptNumber) {
        const maxRetries = this.n8nWebhookRetries;
        const currentAttempt = attemptNumber + 1;
        try {
            const payload = {
                userId,
                userName,
                userPhone,
                channel: 'instagram',
                message,
                messageId,
                timestamp: Date.now(),
            };
            this.logger.debug(`[callN8NWebhook] Attempt ${currentAttempt}/${maxRetries + 1} → URL: ${this.n8nWebhookUrl} | userId: ${userId} | messageId: ${messageId}`);
            const response = await axios_1.default.post(this.n8nWebhookUrl, payload, {
                timeout: this.n8nWebhookTimeout,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            this.logger.debug(`[callN8NWebhook] Raw response received:
        - response exists: ${!!response}
        - response.data exists: ${!!response.data}
        - response.data type: ${typeof response.data}
        - response.data is array: ${Array.isArray(response.data)}
        - response.data: ${JSON.stringify(response.data).substring(0, 500)}...`);
            let aiResponseData;
            if (Array.isArray(response.data)) {
                if (response.data.length === 0) {
                    throw new Error('N8N webhook returned empty array');
                }
                aiResponseData = response.data[0];
                this.logger.debug(`[callN8NWebhook] Extracted from array format (length: ${response.data.length})`);
            }
            else if (typeof response.data === 'string') {
                try {
                    const dataStr = response.data;
                    const cleanedString = dataStr
                        .replace(/\r\n/g, ' ')
                        .replace(/\n/g, ' ')
                        .replace(/\r/g, ' ')
                        .replace(/\t/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim();
                    const parsed = JSON.parse(cleanedString);
                    if (Array.isArray(parsed)) {
                        if (parsed.length === 0) {
                            throw new Error('N8N webhook returned empty array (after parsing)');
                        }
                        aiResponseData = parsed[0];
                        this.logger.debug(`[callN8NWebhook] Extracted from parsed array format (length: ${parsed.length})`);
                    }
                    else if (typeof parsed === 'object' && parsed !== null) {
                        aiResponseData = parsed;
                        this.logger.debug(`[callN8NWebhook] Received parsed object format`);
                    }
                    else {
                        throw new Error(`N8N webhook returned invalid format after parsing: ${typeof parsed}`);
                    }
                }
                catch (parseError) {
                    throw new Error(`Failed to parse N8N response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
                }
            }
            else if (typeof response.data === 'object' && response.data !== null) {
                aiResponseData = response.data;
                this.logger.debug(`[callN8NWebhook] Received object format (direct response)`);
            }
            else {
                throw new Error(`N8N webhook returned invalid format: ${typeof response.data}`);
            }
            if (!aiResponseData.aiResponse) {
                throw new Error('N8N response missing aiResponse field');
            }
            this.logger.log(`[callN8NWebhook] Success → userId: ${aiResponseData.userId} | aiResponse length: ${aiResponseData.aiResponse?.length || 0} | confidence: ${aiResponseData.confidence} | model: ${aiResponseData.model}`);
            return aiResponseData;
        }
        catch (error) {
            const { reason, detail, errorCode } = this.extractErrorDetail(error);
            this.logger.debug(`[callN8NWebhook] Error details: ${detail}`);
            if (currentAttempt <= maxRetries) {
                this.logger.warn(`[callN8NWebhook] Attempt ${currentAttempt}/${maxRetries + 1} failed (code: ${errorCode}): ${reason}. Retrying...`);
                await new Promise((resolve) => setTimeout(resolve, 1000));
                return this.callN8NWebhookWithRetry(userId, userName, userPhone, message, messageId, attemptNumber + 1);
            }
            else {
                this.logger.error(`[callN8NWebhook] Failed after ${maxRetries + 1} attempts → userId: ${userId} | errorCode: ${errorCode} | reason: ${reason}`);
                this.logger.error(`[callN8NWebhook] Full error details:\n${detail}`);
                return null;
            }
        }
    }
    extractErrorDetail(error) {
        if (axios_1.default.isAxiosError(error)) {
            const axiosError = error;
            const httpStatus = axiosError.response?.status ?? 'no-response';
            const metaError = axiosError.response?.data?.error;
            const reason = metaError?.message ?? axiosError.message;
            const errorCode = metaError?.code;
            const detail = `httpStatus: ${httpStatus}\n` +
                `  errorCode : ${metaError?.code ?? 'n/a'}\n` +
                `  message  : ${metaError?.message ?? 'n/a'}\n` +
                `  apiUrl   : ${this.n8nWebhookUrl}\n` +
                `  rawBody  : ${JSON.stringify(axiosError.response?.data ?? null)}`;
            return { reason, detail, errorCode };
        }
        const reason = error instanceof Error ? error.message : String(error);
        return { reason, detail: `(non-axios error) ${reason}` };
    }
    async sendToOneWithId(messageId, recipient, message, mediaUrl) {
        const record = await this.prisma.igMessage.create({
            data: {
                id: (0, uuid_1.v4)(),
                messageId,
                recipient,
                body: message,
                mediaUrl: mediaUrl ?? null,
                status: 'PENDING',
            },
        });
        try {
            const payload = this.buildPayload(recipient, message, mediaUrl);
            this.logger.debug(`[sendToOneWithId] Calling Instagram API → URL: ${this.apiUrl} | recipient: ${recipient}`);
            const response = await axios_1.default.post(this.apiUrl, payload, {
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
        }
        catch (error) {
            const reason = this.extractError(error);
            this.logger.warn(`Failed to send message to ${recipient}: ${reason}.`);
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
};
exports.InstagramService = InstagramService;
exports.InstagramService = InstagramService = InstagramService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        config_1.ConfigService])
], InstagramService);
//# sourceMappingURL=instagram.service.js.map