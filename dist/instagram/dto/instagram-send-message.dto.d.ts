export interface InstagramSendMessageDto {
    recipient: {
        id: string;
    };
    messaging_type: string;
    message: {
        text: string;
    };
}
