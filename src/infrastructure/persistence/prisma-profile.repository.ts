import { Injectable, Inject, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { IMetaProfileProvider } from '../../domain/ports/IMetaProfileProvider'
import {
  IProfileRepository,
  ProfileInfo,
} from '../../domain/ports/IProfileRepository'

@Injectable()
export class PrismaProfileRepository implements IProfileRepository {
  private readonly logger = new Logger(PrismaProfileRepository.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject('IMetaProfileProvider') private readonly metaProvider: IMetaProfileProvider,
  ) {}

  async getByChannelUserId(channelUserId: string, channel: string): Promise<ProfileInfo> {
    try {
      const existing = await this.prisma.userIdentity.findUnique({
        where: { channelUserId_channel: { channelUserId, channel } },
      })

      if (existing?.displayName) {
        const meta = existing.metadata as Record<string, unknown> | null
        return {
          displayName: existing.displayName,
          username: meta?.['username'] as string | undefined,
        }
      }

      const profile = await this.metaProvider.fetchProfile(channelUserId)
      const displayName = profile.name || profile.username
      return { displayName, username: profile.username }
    } catch (error) {
      this.logger.error(
        `Profile lookup error: ${error instanceof Error ? error.message : String(error)}`,
      )
      return {}
    }
  }
}
