import { Client } from 'twitter-api-sdk'
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
  private client: Client | null = null

  async initialize(config: TwitterConfig): Promise<void> {
    this.client = new Client(config.apiKey)
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.client) return false
    try {
      await this.client.users.findMyUser()
      return true
    } catch {
      return false
    }
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.client) {
      throw new Error('Twitter adapter not initialized')
    }

    const params: any = { text: content.text }

    if (content.media?.length) {
      params.media = {
        media_ids: content.media.map(m => m.url),
      }
    }

    const response = await this.client.tweets.createTweet(params)

    if (!response.data) {
      throw new Error('Failed to create tweet')
    }

    return {
      id: response.data.id,
      platform: Platform.TWITTER,
      url: `https://twitter.com/i/status/${response.data.id}`,
      timestamp: new Date(),
      metadata: response.data,
    }
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Twitter adapter not initialized')
    }

    try {
      await this.client.tweets.deleteTweetById(postId)
      return true
    } catch {
      return false
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    if (!this.client) {
      throw new Error('Twitter adapter not initialized')
    }

    const tweet = await this.client.tweets.findTweetById(postId, {
      'tweet.fields': ['public_metrics'],
    })

    if (!tweet.data) {
      throw new Error('Failed to get tweet metrics')
    }

    const metrics = tweet.data.public_metrics || {
      like_count: 0,
      retweet_count: 0,
      reply_count: 0,
      quote_count: 0,
    }

    return {
      likes: metrics.like_count || 0,
      shares: metrics.retweet_count || 0,
      replies: metrics.reply_count || 0,
      reach: (metrics.quote_count || 0) + (metrics.retweet_count || 0),
      platformSpecific: metrics,
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    if (!this.client) {
      throw new Error('Twitter adapter not initialized')
    }

    const params: any = {
      text: content.text,
      reply: {
        in_reply_to_tweet_id: postId,
      },
    }

    if (content.media?.length) {
      params.media = {
        media_ids: content.media.map(m => m.url),
      }
    }

    const response = await this.client.tweets.createTweet(params)

    if (!response.data) {
      throw new Error('Failed to create reply')
    }

    return {
      id: response.data.id,
      platform: Platform.TWITTER,
      url: `https://twitter.com/i/status/${response.data.id}`,
      timestamp: new Date(),
      metadata: response.data,
    }
  }

  async getFollowerCount(): Promise<number> {
    if (!this.client) {
      throw new Error('Twitter adapter not initialized')
    }

    const user = await this.client.users.findMyUser({
      'user.fields': ['public_metrics'],
    })

    return user.data?.public_metrics?.followers_count || 0
  }

  getPlatformSpecificFeatures(): Record<string, unknown> {
    return {
      maxCharacters: 280,
      canSchedule: true,
      mediaTypes: ['image', 'video'],
      features: ['threads', 'polls'],
    }
  }

  async schedule(content: PostContent, publishAt: Date): Promise<PostResponse> {
    throw new Error('Twitter does not support scheduling posts')
  }

  async getReachMetrics(postId: string): Promise<number> {
    const metrics = await this.getEngagement(postId)
    return metrics.reach
  }
}
