import { IsString, IsArray, IsNotEmpty, IsOptional, ArrayMinSize } from 'class-validator';

export class SendInstagramDto {
  @IsString()
  @IsNotEmpty()
  messageId: string;

  /**
   * recipients: Instagram-scoped user IDs (IGSID).
   * Obtained from the Messenger/Instagram webhook when a user messages first.
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  recipients: string[];

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsString()
  mediaUrl?: string | null;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
