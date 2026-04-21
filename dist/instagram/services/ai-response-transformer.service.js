"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var AIResponseTransformerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIResponseTransformerService = void 0;
const common_1 = require("@nestjs/common");
let AIResponseTransformerService = AIResponseTransformerService_1 = class AIResponseTransformerService {
    constructor() {
        this.logger = new common_1.Logger(AIResponseTransformerService_1.name);
    }
    transformIncomingToN8N(instagramMessage, userId, userName) {
        const n8nRequest = {
            userId,
            userName,
            userPhone: instagramMessage.sender.id,
            channel: 'instagram',
            message: instagramMessage.message.text || '',
            messageId: instagramMessage.message.mid,
            timestamp: instagramMessage.timestamp,
        };
        this.logger.debug(`[transformIncomingToN8N] Transformed Instagram message:
      - userId: ${userId}
      - userName: ${userName}
      - senderId (IGSID): ${instagramMessage.sender.id}
      - messageId: ${instagramMessage.message.mid}
      - message length: ${instagramMessage.message.text?.length || 0}`);
        return n8nRequest;
    }
    transformN8NResponseToInstagram(n8nResponse) {
        const instagramMessage = {
            recipient: {
                id: n8nResponse.senderId,
            },
            messaging_type: 'RESPONSE',
            message: {
                text: n8nResponse.aiResponse,
            },
        };
        this.logger.debug(`[transformN8NResponseToInstagram] Transformed N8N response:
      - senderId (recipient IGSID): ${n8nResponse.senderId}
      - aiResponse length: ${n8nResponse.aiResponse?.length || 0}
      - confidence: ${n8nResponse.confidence}
      - model: ${n8nResponse.model}`);
        return instagramMessage;
    }
};
exports.AIResponseTransformerService = AIResponseTransformerService;
exports.AIResponseTransformerService = AIResponseTransformerService = AIResponseTransformerService_1 = __decorate([
    (0, common_1.Injectable)()
], AIResponseTransformerService);
//# sourceMappingURL=ai-response-transformer.service.js.map