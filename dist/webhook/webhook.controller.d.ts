import { WebhookService } from './webhook.service';
export declare class WebhookController {
    private readonly webhookService;
    private readonly logger;
    constructor(webhookService: WebhookService);
    verifyWebhook(mode: string, challenge: string, verifyToken: string): string | number;
    receiveEvent(body: Record<string, unknown>): {
        received: boolean;
    };
}
