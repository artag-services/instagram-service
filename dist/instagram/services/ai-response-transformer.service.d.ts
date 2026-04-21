import { IncomingInstagramMessageDto } from '../dto/incoming-instagram-message.dto';
import { InstagramAIRequestDto } from '../dto/instagram-ai-request.dto';
import { InstagramAIResponseDto } from '../dto/instagram-ai-response.dto';
import { InstagramSendMessageDto } from '../dto/instagram-send-message.dto';
export declare class AIResponseTransformerService {
    private readonly logger;
    transformIncomingToN8N(instagramMessage: IncomingInstagramMessageDto, userId: string, userName: string): InstagramAIRequestDto;
    transformN8NResponseToInstagram(n8nResponse: InstagramAIResponseDto): InstagramSendMessageDto;
}
