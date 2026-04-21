import { Module } from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { InstagramListener } from './instagram.listener';
import { AIResponseService } from './services/ai-response.service';
import { AIResponseTransformerService } from './services/ai-response-transformer.service';
import { InstagramController, InstagramSendController } from './instagram.controller';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  controllers: [InstagramController, InstagramSendController],
  providers: [InstagramService, InstagramListener, AIResponseService, AIResponseTransformerService],
  exports: [InstagramService, AIResponseService],
})
export class InstagramModule {}
