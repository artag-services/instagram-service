import { Logger } from '@nestjs/common'
import { ILogger } from '../../domain/ports/ILogger'

export class NestLoggerAdapter implements ILogger {
  private readonly logger: Logger

  constructor(context: string) {
    this.logger = new Logger(context)
  }

  warn(message: string): void {
    this.logger.warn(message)
  }

  error(message: string, trace?: string): void {
    this.logger.error(message, trace)
  }
}
