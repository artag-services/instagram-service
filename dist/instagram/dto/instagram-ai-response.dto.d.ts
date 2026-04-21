export interface InstagramAIResponseDto {
    userId: string;
    senderId: string;
    messageId: string;
    aiResponse: string;
    confidence?: number;
    model?: string;
    processingTime?: number;
    timestamp?: number;
}
