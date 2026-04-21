export interface IncomingInstagramMessageDto {
    sender: {
        id: string;
    };
    recipient: {
        id: string;
    };
    timestamp: number;
    message: {
        mid: string;
        text?: string;
        is_self?: boolean;
        is_echo?: boolean;
    };
}
