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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebhookController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookController = void 0;
const common_1 = require("@nestjs/common");
const webhook_service_1 = require("./webhook.service");
let WebhookController = WebhookController_1 = class WebhookController {
    constructor(webhookService) {
        this.webhookService = webhookService;
        this.logger = new common_1.Logger(WebhookController_1.name);
    }
    verifyWebhook(mode, challenge, verifyToken) {
        return this.webhookService.verifyChallenge(mode, challenge, verifyToken);
    }
    receiveEvent(body) {
        this.logger.debug('Webhook event received');
        this.webhookService.processEvent(body);
        return { received: true };
    }
};
exports.WebhookController = WebhookController;
__decorate([
    (0, common_1.Get)('instagram'),
    __param(0, (0, common_1.Query)('hub.mode')),
    __param(1, (0, common_1.Query)('hub.challenge')),
    __param(2, (0, common_1.Query)('hub.verify_token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Object)
], WebhookController.prototype, "verifyWebhook", null);
__decorate([
    (0, common_1.Post)('instagram'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Object)
], WebhookController.prototype, "receiveEvent", null);
exports.WebhookController = WebhookController = WebhookController_1 = __decorate([
    (0, common_1.Controller)('webhook'),
    __metadata("design:paramtypes", [webhook_service_1.WebhookService])
], WebhookController);
//# sourceMappingURL=webhook.controller.js.map