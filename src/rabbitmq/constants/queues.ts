export const RABBITMQ_EXCHANGE = 'channels';

export const ROUTING_KEYS = {
  INSTAGRAM_SEND: 'channels.instagram.send',
  INSTAGRAM_RESPONSE: 'channels.instagram.response',
  INSTAGRAM_AI_RESPONSE: 'channels.instagram.ai-response',
  INSTAGRAM_AI_RESPONSE_CHUNK_FAILED: 'channels.instagram.ai-response-chunk-failed',
  INSTAGRAM_AI_RESPONSE_DLQ: 'channels.instagram.ai-response-dlq',

  // Instagram Events - Incoming events from webhooks
  INSTAGRAM_MESSAGE_RECEIVED: 'channels.instagram.events.message',
  INSTAGRAM_COMMENT_RECEIVED: 'channels.instagram.events.comment',
  INSTAGRAM_REACTION_RECEIVED: 'channels.instagram.events.reaction',
  INSTAGRAM_SEEN_RECEIVED: 'channels.instagram.events.seen',
  INSTAGRAM_REFERRAL_RECEIVED: 'channels.instagram.events.referral',
  INSTAGRAM_OPTIN_RECEIVED: 'channels.instagram.events.optin',
  INSTAGRAM_HANDOVER_RECEIVED: 'channels.instagram.events.handover',

  // Identity Service
  IDENTITY_RESOLVE: 'channels.identity.resolve',
} as const;

export const QUEUES = {
  INSTAGRAM_SEND: 'instagram.send',

  // Instagram Events Queues
  INSTAGRAM_EVENTS_MESSAGE: 'instagram.events.message',
  INSTAGRAM_EVENTS_COMMENT: 'instagram.events.comment',
  INSTAGRAM_EVENTS_REACTION: 'instagram.events.reaction',
  INSTAGRAM_EVENTS_SEEN: 'instagram.events.seen',
  INSTAGRAM_EVENTS_REFERRAL: 'instagram.events.referral',
  INSTAGRAM_EVENTS_OPTIN: 'instagram.events.optin',
  INSTAGRAM_EVENTS_HANDOVER: 'instagram.events.handover',

  // AI Response Queues
  INSTAGRAM_AI_RESPONSE: 'instagram.ai-response',
  INSTAGRAM_AI_RESPONSE_CHUNK_FAILED: 'instagram.ai-response-chunk-failed',
  INSTAGRAM_AI_RESPONSE_DLQ: 'instagram.ai-response-dlq',

  GATEWAY_RESPONSES: 'gateway.responses',
} as const;
