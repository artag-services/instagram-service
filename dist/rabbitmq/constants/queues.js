"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUEUES = exports.ROUTING_KEYS = exports.RABBITMQ_EXCHANGE = void 0;
exports.RABBITMQ_EXCHANGE = 'channels';
exports.ROUTING_KEYS = {
    INSTAGRAM_SEND: 'channels.instagram.send',
    INSTAGRAM_RESPONSE: 'channels.instagram.response',
    INSTAGRAM_AI_RESPONSE: 'channels.instagram.ai-response',
    INSTAGRAM_AI_RESPONSE_CHUNK_FAILED: 'channels.instagram.ai-response-chunk-failed',
    INSTAGRAM_AI_RESPONSE_DLQ: 'channels.instagram.ai-response-dlq',
    INSTAGRAM_MESSAGE_RECEIVED: 'channels.instagram.events.message',
    INSTAGRAM_COMMENT_RECEIVED: 'channels.instagram.events.comment',
    INSTAGRAM_REACTION_RECEIVED: 'channels.instagram.events.reaction',
    INSTAGRAM_SEEN_RECEIVED: 'channels.instagram.events.seen',
    INSTAGRAM_REFERRAL_RECEIVED: 'channels.instagram.events.referral',
    INSTAGRAM_OPTIN_RECEIVED: 'channels.instagram.events.optin',
    INSTAGRAM_HANDOVER_RECEIVED: 'channels.instagram.events.handover',
    CONVERSATION_INCOMING: 'channels.conversation.incoming',
    CONVERSATION_CREATED: 'channels.conversation.created',
    CONVERSATION_AI_TOGGLE: 'channels.conversation.ai-toggle',
    CONVERSATION_AGENT_ASSIGN: 'channels.conversation.agent-assign',
};
exports.QUEUES = {
    INSTAGRAM_SEND: 'instagram.send',
    INSTAGRAM_EVENTS_MESSAGE: 'instagram.events.message',
    INSTAGRAM_EVENTS_COMMENT: 'instagram.events.comment',
    INSTAGRAM_EVENTS_REACTION: 'instagram.events.reaction',
    INSTAGRAM_EVENTS_SEEN: 'instagram.events.seen',
    INSTAGRAM_EVENTS_REFERRAL: 'instagram.events.referral',
    INSTAGRAM_EVENTS_OPTIN: 'instagram.events.optin',
    INSTAGRAM_EVENTS_HANDOVER: 'instagram.events.handover',
    INSTAGRAM_AI_RESPONSE: 'instagram.ai-response',
    INSTAGRAM_AI_RESPONSE_CHUNK_FAILED: 'instagram.ai-response-chunk-failed',
    INSTAGRAM_AI_RESPONSE_DLQ: 'instagram.ai-response-dlq',
    CONVERSATION_INCOMING: 'instagram.conversation.incoming',
    CONVERSATION_CREATED: 'instagram.conversation.created',
    CONVERSATION_AI_TOGGLE: 'instagram.conversation.ai-toggle',
    CONVERSATION_AGENT_ASSIGN: 'instagram.conversation.agent-assign',
    GATEWAY_RESPONSES: 'gateway.responses',
};
//# sourceMappingURL=queues.js.map