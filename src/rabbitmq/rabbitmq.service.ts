import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RABBITMQ_EXCHANGE } from './constants/queues';

export interface AssertQueueOptions {
  durable: boolean
  messageTtl?: number
  deadLetterExchange?: string
  deadLetterRoutingKey?: string
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: Awaited<ReturnType<typeof amqp.connect>> | null = null;
  private channel: amqp.Channel | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(retries = 10, delayMs = 3000) {
    const url = this.config.get<string>('RABBITMQ_URL');
    if (!url) throw new Error('RABBITMQ_URL is not defined in environment variables');

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        this.connection = await amqp.connect(url);
        this.channel = await this.connection.createChannel();
        await this.channel.assertExchange(RABBITMQ_EXCHANGE, 'topic', { durable: true });
        this.logger.log('Connected to RabbitMQ');
        return;
      } catch (err) {
        this.logger.warn(`RabbitMQ connection attempt ${attempt}/${retries} failed. Retrying in ${delayMs}ms...`);
        if (attempt === retries) throw err;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private async disconnect() {
    try {
      await this.channel?.close();
      await this.connection?.close();
      this.logger.log('Disconnected from RabbitMQ');
    } catch { /* ignore */ }
  }

  publish(routingKey: string, payload: Record<string, unknown>): void {
    if (!this.channel) throw new Error('RabbitMQ channel not available');
    const content = Buffer.from(JSON.stringify(payload));
    this.channel.publish(RABBITMQ_EXCHANGE, routingKey, content, {
      persistent: true,
      contentType: 'application/json',
    });
    this.logger.debug(`Published ? [${routingKey}]`);
  }

  async assertQueue(
    queue: string,
    routingKey: string,
    options?: AssertQueueOptions,
  ): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not available');
    const args: Record<string, unknown> = {};
    if (options?.messageTtl) args['x-message-ttl'] = options.messageTtl;
    if (options?.deadLetterExchange) args['x-dead-letter-exchange'] = options.deadLetterExchange;
    if (options?.deadLetterRoutingKey) args['x-dead-letter-routing-key'] = options.deadLetterRoutingKey;
    await this.channel.assertQueue(queue, { durable: options?.durable ?? true, arguments: args });
    await this.channel.bindQueue(queue, RABBITMQ_EXCHANGE, routingKey);
    this.logger.log(`Queue asserted [${queue}] → [${routingKey}]`);
  }

  async subscribe(
    queue: string,
    routingKey: string,
    handler: (payload: Record<string, unknown>) => Promise<void>,
    options?: AssertQueueOptions,
  ): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ channel not available');
    const args: Record<string, unknown> = {};
    if (options?.messageTtl) args['x-message-ttl'] = options.messageTtl;
    if (options?.deadLetterExchange) args['x-dead-letter-exchange'] = options.deadLetterExchange;
    if (options?.deadLetterRoutingKey) args['x-dead-letter-routing-key'] = options.deadLetterRoutingKey;
    await this.channel.assertQueue(queue, { durable: options?.durable ?? true, arguments: args });
    await this.channel.bindQueue(queue, RABBITMQ_EXCHANGE, routingKey);
    this.channel.prefetch(1);
    await this.channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const payload = JSON.parse(msg.content.toString()) as Record<string, unknown>;
        await handler(payload);
        this.channel!.ack(msg);
      } catch (error) {
        this.logger.error(`Error processing message from [${queue}]`, error);
        this.channel!.nack(msg, false, false);
      }
    });
    this.logger.log(`Subscribed ? queue [${queue}] | routing key [${routingKey}]`);
  }
}
