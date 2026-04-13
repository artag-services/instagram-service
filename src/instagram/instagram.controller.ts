import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { InstagramService } from './instagram.service';

interface ConversationWithUser {
  conversationId: string;
  igsid: string;
  username?: string;
}

@Controller('conversations')
export class InstagramController {
  constructor(private readonly instagram: InstagramService) {}

  @Get()
  async getConversations(): Promise<ConversationWithUser[]> {
    return this.instagram.getConversations();
  }
}

@Controller()
export class InstagramSendController {
  constructor(private readonly instagram: InstagramService) {}

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
    return this.instagram.sendToInstagramUser(igsid, body.message, body.mediaUrl);
  }
}
