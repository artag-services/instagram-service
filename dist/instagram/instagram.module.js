"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstagramModule = void 0;
const common_1 = require("@nestjs/common");
const instagram_service_1 = require("./instagram.service");
const instagram_listener_1 = require("./instagram.listener");
const ai_response_service_1 = require("./services/ai-response.service");
const ai_response_transformer_service_1 = require("./services/ai-response-transformer.service");
const instagram_controller_1 = require("./instagram.controller");
const conversations_module_1 = require("../conversations/conversations.module");
let InstagramModule = class InstagramModule {
};
exports.InstagramModule = InstagramModule;
exports.InstagramModule = InstagramModule = __decorate([
    (0, common_1.Module)({
        imports: [conversations_module_1.ConversationsModule],
        controllers: [instagram_controller_1.InstagramController, instagram_controller_1.InstagramSendController],
        providers: [instagram_service_1.InstagramService, instagram_listener_1.InstagramListener, ai_response_service_1.AIResponseService, ai_response_transformer_service_1.AIResponseTransformerService],
        exports: [instagram_service_1.InstagramService, ai_response_service_1.AIResponseService],
    })
], InstagramModule);
//# sourceMappingURL=instagram.module.js.map