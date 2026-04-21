import { InstagramService } from './instagram.service';
interface ConversationWithUser {
    conversationId: string;
    igsid: string;
    username?: string;
}
export declare class InstagramController {
    private readonly instagram;
    constructor(instagram: InstagramService);
    getConversations(): Promise<ConversationWithUser[]>;
}
export declare class InstagramSendController {
    private readonly instagram;
    constructor(instagram: InstagramService);
    sendToUser(igsid: string, body: {
        message: string;
        mediaUrl?: string;
    }): Promise<{
        messageId: string;
        igsid: string;
        status: 'SENT' | 'FAILED';
        timestamp: string;
    }>;
}
export {};
