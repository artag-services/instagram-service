import {
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { AdminGuard } from './admin.guard';

const PAGE = 500;
const SLEEP_MS_EVERY_N = 100;

/**
 * One-shot CQRS backfill for instagram. Mirror of the whatsapp backfill:
 *   - `data.instagram.conversation.created` for every Conversation
 *   - `data.instagram.message.received` for every USER-sender ConversationMessage
 *
 * Auth: `X-Admin-Token: <ADMIN_BACKFILL_TOKEN>`.
 */
@Controller('admin')
@UseGuards(AdminGuard)
export class BackfillController {
  private readonly logger = new Logger(BackfillController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  @Post('backfill-events')
  @HttpCode(HttpStatus.OK)
  async backfill() {
    const started = Date.now();
    let scannedConversations = 0;
    let scannedMessages = 0;
    let published = 0;

    for (let skip = 0; ; skip += PAGE) {
      const convs = await this.prisma.conversation.findMany({
        skip,
        take: PAGE,
        orderBy: { createdAt: 'asc' },
      });
      if (convs.length === 0) break;
      scannedConversations += convs.length;

      for (const conv of convs) {
        await this.rabbitmq.publish('data.instagram.conversation.created', {
          conversationId: conv.id,
          channel: 'instagram',
          channelUserId: conv.channelUserId,
          topic: conv.topic ?? null,
          userId: conv.userId ?? null,
          status: conv.status,
          aiEnabled: conv.aiEnabled,
          agentAssigned: conv.agentAssigned ?? null,
          createdAt: conv.createdAt.toISOString(),
        });
        published++;
        if (published % SLEEP_MS_EVERY_N === 0) await this.sleep(10);
      }
    }

    for (let skip = 0; ; skip += PAGE) {
      const msgs = await this.prisma.conversationMessage.findMany({
        skip,
        take: PAGE,
        where: { sender: 'USER' },
        orderBy: { createdAt: 'asc' },
      });
      if (msgs.length === 0) break;
      scannedMessages += msgs.length;

      for (const msg of msgs) {
        const meta = msg.metadata as Record<string, unknown> | null;
        const channelUserId = (meta?.['channelUserId'] as string | undefined) ?? null;
        await this.rabbitmq.publish('data.instagram.message.received', {
          messageId: msg.externalId ?? msg.id,
          senderId: channelUserId ?? '',
          channelUserId: channelUserId ?? '',
          conversationId: msg.conversationId,
          content: msg.content ?? '',
          mediaUrl: msg.mediaUrl ?? null,
          userId: null,
          channel: 'instagram',
          timestamp: msg.createdAt.toISOString(),
        });
        published++;
        if (published % SLEEP_MS_EVERY_N === 0) await this.sleep(10);
      }
    }

    const durationMs = Date.now() - started;
    this.logger.log(
      `Backfill done: convs=${scannedConversations} msgs=${scannedMessages} ` +
        `published=${published} durationMs=${durationMs}`,
    );
    return {
      service: 'instagram',
      conversations: scannedConversations,
      messages: scannedMessages,
      published,
      durationMs,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
