export interface ProfileData {
  name?: string
  username?: string
}

export interface IMetaProfileProvider {
  fetchProfile(channelUserId: string): Promise<ProfileData>
}
