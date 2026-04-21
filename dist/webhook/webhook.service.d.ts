import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
export declare class WebhookService {
    private readonly config;
    private readonly rabbitmq;
    private readonly logger;
    private readonly verifyToken;
    constructor(config: ConfigService, rabbitmq: RabbitMQService);
    verifyChallenge(mode: string, challenge: string, token: string): number;
    processEvent(body: Record<string, unknown>): void;
    private handleStatusUpdate;
    private handleIncomingMessage;
    private extractEntry;
}
