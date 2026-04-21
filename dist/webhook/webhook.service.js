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
var WebhookService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const rabbitmq_service_1 = require("../rabbitmq/rabbitmq.service");
const queues_1 = require("../rabbitmq/constants/queues");
let WebhookService = WebhookService_1 = class WebhookService {
    constructor(config, rabbitmq) {
        this.config = config;
        this.rabbitmq = rabbitmq;
        this.logger = new common_1.Logger(WebhookService_1.name);
        this.verifyToken = config.getOrThrow('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');
    }
    verifyChallenge(mode, challenge, token) {
        if (mode !== 'subscribe' || token !== this.verifyToken) {
            throw new common_1.UnauthorizedException('Webhook verification failed');
        }
        this.logger.log('Webhook verified by Meta');
        return parseInt(challenge, 10);
    }
    processEvent(body) {
        const entry = this.extractEntry(body);
        if (!entry) {
            this.logger.warn('Webhook event with no processable entry, ignoring');
            return;
        }
        const { type, data } = entry;
        if (type === 'status_update') {
            this.handleStatusUpdate(data);
            return;
        }
        if (type === 'incoming_message') {
            this.handleIncomingMessage(data);
            return;
        }
        this.logger.debug(`Unhandled webhook event type: ${type}`);
    }
    handleStatusUpdate(data) {
        this.logger.log(`Status update: ${JSON.stringify(data)}`);
        this.rabbitmq.publish(queues_1.ROUTING_KEYS.INSTAGRAM_RESPONSE, {
            source: 'webhook',
            type: 'status_update',
            ...data,
            timestamp: new Date().toISOString(),
        });
    }
    handleIncomingMessage(data) {
        this.logger.log(`Incoming message from: ${data['from']}`);
        this.rabbitmq.publish(queues_1.ROUTING_KEYS.INSTAGRAM_RESPONSE, {
            source: 'webhook',
            type: 'incoming_message',
            ...data,
            timestamp: new Date().toISOString(),
        });
    }
    extractEntry(body) {
        const entries = body['entry'];
        if (!entries?.length)
            return null;
        const messaging = entries[0]['messaging'];
        if (messaging?.length) {
            const msg = messaging[0];
            if (msg['read'] || msg['delivery']) {
                return { type: 'status_update', data: msg };
            }
            if (msg['message']) {
                return { type: 'incoming_message', data: msg };
            }
        }
        const changes = entries[0]['changes'];
        if (changes?.length) {
            const value = changes[0]['value'];
            if (!value)
                return null;
            if (value['statuses'])
                return { type: 'status_update', data: value };
            if (value['messages'])
                return { type: 'incoming_message', data: value };
        }
        return null;
    }
};
exports.WebhookService = WebhookService;
exports.WebhookService = WebhookService = WebhookService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        rabbitmq_service_1.RabbitMQService])
], WebhookService);
//# sourceMappingURL=webhook.service.js.map