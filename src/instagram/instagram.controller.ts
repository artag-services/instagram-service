import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SendMessageUseCase } from '../domain/services/send-message.usecase';
import { MetaGraphClient } from './clients/meta-graph.client';

interface ConversationWithUser {
  conversationId: string;
  igsid: string;
  username?: string;
}

@Controller('conversations')
export class InstagramController {
  constructor(private readonly meta: MetaGraphClient) {}

  @Get()
  async getConversations(): Promise<ConversationWithUser[]> {
    return this.meta.listConversations();
  }
}

@Controller()
export class InstagramSendController {
  constructor(private readonly sendMessageUseCase: SendMessageUseCase) {}

  /**
   * Send a message to a specific Instagram user by IGSID.
   * 
   * POST /send/:igsid
   * Body: { message, mediaUrl? }
   */
  @Post('send/:igsid')
  async sendToUser(
    @Param('igsid') igsid: string,
    @Body() body: { message: string; mediaUrl?: string },
  ): Promise<{ messageId: string; igsid: string; status: 'SENT' | 'FAILED'; timestamp: string }> {
    const messageId = uuidv4();
    try {
      await this.sendMessageUseCase.sendToOneWithId(messageId, igsid, body.message, body.mediaUrl);
      return { messageId, igsid, status: 'SENT', timestamp: new Date().toISOString() };
    } catch {
      return { messageId, igsid, status: 'FAILED', timestamp: new Date().toISOString() };
    }
  }
}
