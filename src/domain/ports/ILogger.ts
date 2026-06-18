export interface ILogger {
  warn(message: string, context?: string): void
  error(message: string, trace?: string, context?: string): void
}
