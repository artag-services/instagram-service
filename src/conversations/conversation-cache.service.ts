import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Bounded LRU + TTL cache for active conversations.
 *
 * Previous impl was an unbounded `Map<string, CachedConversation>` → memory
 * grew with every new user and never shrank. With ~100k users that's MBs of
 * stale data pinned forever.
 *
 * Now:
 *   - Max entries: `CONVERSATION_CACHE_MAX_SIZE` (default 5000) — oldest evicted
 *   - TTL: `CONVERSATION_CACHE_TTL_MS` (default 1h) — entries expire on read
 *   - LRU bump on access: hot conversations stay, cold ones get evicted
 *
 * Not thread-safe, but safe under Node's single-threaded event loop.
 */
export interface CachedConversation {
  id: string
  channelUserId: string
  topic: string | null
  aiEnabled: boolean
  agentAssigned: string | null
  userId: string | null
  status: string
}

interface CacheEntry {
  value: CachedConversation
  expiresAt: number
}

@Injectable()
export class ConversationCacheService implements OnModuleInit {
  private readonly logger = new Logger(ConversationCacheService.name)
  private cache = new Map<string, CacheEntry>()
  private maxSize!: number
  private ttlMs!: number

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.maxSize = Number(this.config.get<string>('CONVERSATION_CACHE_MAX_SIZE') ?? 5000)
    this.ttlMs = Number(this.config.get<string>('CONVERSATION_CACHE_TTL_MS') ?? 60 * 60 * 1000)
    this.logger.log(`ConversationCache ready — maxSize=${this.maxSize} ttlMs=${this.ttlMs}`)
  }

  set(channelUserId: string, data: CachedConversation): void {
    // Evict if full (and we're inserting a new key).
    if (!this.cache.has(channelUserId) && this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
    // Delete + re-insert to bump to the most-recent position.
    this.cache.delete(channelUserId)
    this.cache.set(channelUserId, { value: data, expiresAt: Date.now() + this.ttlMs })
  }

  get(channelUserId: string): CachedConversation | undefined {
    const entry = this.cache.get(channelUserId)
    if (!entry) return undefined
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(channelUserId)
      return undefined
    }
    // LRU bump
    this.cache.delete(channelUserId)
    this.cache.set(channelUserId, entry)
    return entry.value
  }

  has(channelUserId: string): boolean {
    return this.get(channelUserId) !== undefined
  }

  update(channelUserId: string, updates: Partial<CachedConversation>): void {
    const current = this.get(channelUserId)
    if (current) {
      this.set(channelUserId, { ...current, ...updates })
    }
  }

  delete(channelUserId: string): void {
    this.cache.delete(channelUserId)
  }

  size(): number {
    return this.cache.size
  }

  clear(): void {
    this.cache.clear()
    this.logger.log('Conversation cache cleared')
  }
}
