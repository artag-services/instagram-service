import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from './prisma/prisma.module'
import { RabbitMQModule } from './rabbitmq/rabbitmq.module'
import { WebhookModule } from './webhook/webhook.module'
import { AdminModule } from './admin/admin.module'

// Old clients (wrapped by new adapters — keep until old adapters are removed)
import { MetaGraphClient } from './instagram/clients/meta-graph.client'
import { N8nClient } from './instagram/clients/n8n.client'

// Infrastructure adapters
import { PrismaMessageRepository } from './infrastructure/persistence/prisma-message.repository'
import { PrismaConversationRepository } from './infrastructure/persistence/prisma-conversation.repository'
import { PrismaRateLimitRepository } from './infrastructure/persistence/prisma-rate-limit.repository'
import { PrismaAIResponseRepository } from './infrastructure/persistence/prisma-ai-response.repository'
import { PrismaProfileRepository } from './infrastructure/persistence/prisma-profile.repository'
import { PrismaUserIdentityRepository } from './infrastructure/persistence/prisma-user-identity.repository'
import { MetaApiSender } from './infrastructure/messaging/meta-api.sender'
import { N8nAIService } from './infrastructure/messaging/n8n-ai.service'
import { InMemoryConversationCache } from './infrastructure/cache/in-memory-conversation-cache'
import { RabbitMQEventPublisher } from './infrastructure/event-bus/rabbitmq-event-publisher'
import { NestLoggerAdapter } from './infrastructure/logging/nest-logger.adapter'

// Domain use cases (constructed via useFactory to keep them pure of NestJS)
import { SendMessageUseCase } from './domain/services/send-message.usecase'
import { ProcessAIUseCase } from './domain/services/process-ai.usecase'
import { ManageConversationUseCase } from './domain/services/manage-conversation.usecase'
import { HandleAIResponseUseCase } from './domain/services/handle-ai-response.usecase'

// Application consumers
import { InstagramConsumer } from './application/consumers/instagram.consumer'
import { ConversationConsumer } from './application/consumers/conversation-consumer.listener'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    RabbitMQModule,
    WebhookModule,
    AdminModule,
  ],
  providers: [
    // Old clients (wrapped by new adapters)
    MetaGraphClient,
    { provide: 'IMetaProfileProvider', useClass: MetaGraphClient },
    N8nClient,

    // Port tokens → Adapter implementations
    { provide: 'IMessageRepository', useClass: PrismaMessageRepository },
    { provide: 'IConversationRepository', useClass: PrismaConversationRepository },
    { provide: 'IRateLimitService', useClass: PrismaRateLimitRepository },
    { provide: 'IAIResponseRepository', useClass: PrismaAIResponseRepository },
    { provide: 'IProfileRepository', useClass: PrismaProfileRepository },
    { provide: 'IUserIdentityRepository', useClass: PrismaUserIdentityRepository },
    { provide: 'IMessageSender', useClass: MetaApiSender },
    { provide: 'IAIService', useClass: N8nAIService },
    { provide: 'ICacheService', useClass: InMemoryConversationCache },
    { provide: 'IEventPublisher', useClass: RabbitMQEventPublisher },
    { provide: 'ILogger', useFactory: () => new NestLoggerAdapter('ManageConversationUseCase') },

    // Use cases — constructed via factory to keep them decorator-free
    {
      provide: SendMessageUseCase,
      useFactory: (repo, sender) => new SendMessageUseCase(repo, sender),
      inject: ['IMessageRepository', 'IMessageSender'],
    },
    {
      provide: ProcessAIUseCase,
      useFactory: (cache, convRepo, identityRepo, ai, rateLimiter, eventBus) =>
        new ProcessAIUseCase(cache, convRepo, identityRepo, ai, rateLimiter, eventBus),
      inject: ['ICacheService', 'IConversationRepository', 'IUserIdentityRepository', 'IAIService', 'IRateLimitService', 'IEventPublisher'],
    },
    {
      provide: ManageConversationUseCase,
      useFactory: (cache, convRepo, eventBus, logger) =>
        new ManageConversationUseCase(cache, convRepo, eventBus, logger),
      inject: ['ICacheService', 'IConversationRepository', 'IEventPublisher', 'ILogger'],
    },
    {
      provide: HandleAIResponseUseCase,
      useFactory: (eventBus, aiResponseRepo) => new HandleAIResponseUseCase(eventBus, aiResponseRepo),
      inject: ['IEventPublisher', 'IAIResponseRepository'],
    },

    // Application consumers
    InstagramConsumer,
    ConversationConsumer,
  ],
})
export class AppModule {}
