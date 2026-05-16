import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { MetaGraphClient } from './clients/meta-graph.client';
import { N8nClient } from './clients/n8n.client';
import { InstagramController, InstagramSendController } from './instagram.controller';
import { InstagramListener } from './instagram.listener';
import { InstagramService } from './instagram.service';
import { AIResponseService } from './services/ai-response.service';
import { AIResponseTransformerService } from './services/ai-response-transformer.service';

@Module({
  imports: [ConversationsModule],
  controllers: [InstagramController, InstagramSendController],
  providers: [
    MetaGraphClient,
    N8nClient,
    InstagramService,
    InstagramListener,
    AIResponseService,
    AIResponseTransformerService,
  ],
  exports: [InstagramService, AIResponseService],
})
export class InstagramModule {}
