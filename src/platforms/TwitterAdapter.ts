import { TwitterApi } from 'twitter-api-v2'
import { Platform } from '../domain/types'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
  EngagementMetrics,
} from './PlatformAdapter'

export interface TwitterConfig {
  apiKey: string
  apiSecret: string
  accessToken: string
  accessTokenSecret: string
}

export class TwitterAdapter implements PlatformAdapter {
  platform = Platform.TWITTER
  private client: TwitterApi | null = null
  private config: TwitterConfig | null = null

  async initialize(config: TwitterConfig): Promise<void> {
    this.config = config
    this.client = new TwitterApi({
      appKey: config.apiKey,
      appSecret: config.apiSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessTokenSecret,
    })
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.client) return false
    try {
      const user = await this.client.v2.me()
      return !!user.data
    } catch {
      return false
    }
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.client) throw new Error('Twitter client not initialized')

    const mediaIds = await this.uploadMedia(content.media || [])
    const mediaIdsTuple = mediaIds.slice(0, 4) as
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]

    const tweet = await this.client.v2.tweet(content.text, {
      media: mediaIds.length ? { media_ids: mediaIdsTuple } : undefined,
    })

    if (!tweet.data) {
      throw new Error('Failed to create tweet')
    }

    return {
      id: tweet.data.id,
      platform: Platform.TWITTER,
      timestamp: new Date(),
      url: `https://twitter.com/i/web/status/${tweet.data.id}`,
      metadata: tweet.data,
    }
  }

  async schedule(
    _content: PostContent,
    _publishAt: Date,
  ): Promise<PostResponse> {
    // Note: Twitter API v2 doesn't support scheduling directly
    // We'll need to implement this using a job queue
    throw new Error('Scheduling not implemented for Twitter')
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.client) throw new Error('Twitter client not initialized')

    try {
      await this.client.v2.deleteTweet(postId)
      return true
    } catch {
      return false
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    if (!this.client) throw new Error('Twitter client not initialized')

    const tweet = await this.client.v2.singleTweet(postId, {
      'tweet.fields': ['public_metrics'],
    })

    const metrics = tweet.data.public_metrics || {
      like_count: 0,
      retweet_count: 0,
      reply_count: 0,
      impression_count: 0,
      quote_count: 0,
    }

    return {
      likes: metrics.like_count,
      shares: metrics.retweet_count,
      replies: metrics.reply_count,
      reach: metrics.impression_count,
      platformSpecific: {
        quotes: metrics.quote_count,
      },
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    if (!this.client) throw new Error('Twitter client not initialized')

    const mediaIds = await this.uploadMedia(content.media || [])
    const mediaIdsTuple = mediaIds.slice(0, 4) as
      | [string]
      | [string, string]
      | [string, string, string]
      | [string, string, string, string]

    const tweet = await this.client.v2.reply(content.text, postId, {
      media: mediaIds.length ? { media_ids: mediaIdsTuple } : undefined,
    })

    return {
      id: tweet.data.id,
      platform: Platform.TWITTER,
      timestamp: new Date(),
      url: `https://twitter.com/i/web/status/${tweet.data.id}`,
      metadata: { ...tweet.data, replyTo: postId },
    }
  }

  async getFollowerCount(): Promise<number> {
    if (!this.client) throw new Error('Twitter client not initialized')

    const user = await this.client.v2.me({
      'user.fields': ['public_metrics'],
    })

    return user.data.public_metrics?.followers_count || 0
  }

  async getReachMetrics(postId: string): Promise<number> {
    const engagement = await this.getEngagement(postId)
    return engagement.reach
  }

  getPlatformSpecificFeatures(): Record<string, any> {
    return {
      canSchedule: false,
      maxCharacters: 280,
      mediaTypes: ['image', 'video', 'gif'],
      maxMediaPerPost: 4,
    }
  }

  private async uploadMedia(media: PostContent['media']): Promise<string[]> {
    if (!this.client || !media?.length) return []

    const mediaIds = await Promise.all(
      media.map(async item => {
        if (item.type !== 'image' && item.type !== 'video') return null

        try {
          const mediaId = await this.client!.v1.uploadMedia(item.url)
          return mediaId
        } catch {
          return null
        }
      }),
    )

    return mediaIds.filter((id): id is string => id !== null)
  }
}
