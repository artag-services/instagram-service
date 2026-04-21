export declare class SendInstagramDto {
    messageId: string;
    recipients: string[];
    message: string;
    mediaUrl?: string | null;
    metadata?: Record<string, unknown>;
}
