export interface ProfileInfo {
  displayName?: string
  username?: string
}

export interface IProfileRepository {
  getByChannelUserId(channelUserId: string, channel: string): Promise<ProfileInfo>
}
