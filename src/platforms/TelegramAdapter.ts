import TelegramBot from 'node-telegram-bot-api'
import { Platform } from '../domain/types'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
  EngagementMetrics,
} from './PlatformAdapter'

export interface TelegramConfig {
  botToken: string
  channelId: string
}

export class TelegramAdapter implements PlatformAdapter {
  platform = Platform.TELEGRAM
  private bot: TelegramBot | null = null
  private channelId: string | null = null

  async initialize(config: TelegramConfig): Promise<void> {
    this.bot = new TelegramBot(config.botToken, { polling: false })
    this.channelId = config.channelId
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.bot) return false
    try {
      await this.bot.getMe()
      return true
    } catch {
      return false
    }
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.bot || !this.channelId) {
      throw new Error('Telegram adapter not initialized')
    }

    let message: TelegramBot.Message

    if (content.media && content.media.length > 0) {
      const media = content.media[0]
      if (media.type === 'image') {
        message = await this.bot.sendPhoto(this.channelId, media.url, {
          caption: content.text,
        })
      } else if (media.type === 'video') {
        message = await this.bot.sendVideo(this.channelId, media.url, {
          caption: content.text,
        })
      } else {
        message = await this.bot.sendMessage(this.channelId, content.text)
      }
    } else {
      message = await this.bot.sendMessage(this.channelId, content.text)
    }

    return {
      id: message.message_id.toString(),
      platform: Platform.TELEGRAM,
      timestamp: new Date(message.date * 1000),
      metadata: message,
    }
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.bot || !this.channelId) {
      throw new Error('Telegram adapter not initialized')
    }

    try {
      return await this.bot.deleteMessage(this.channelId, parseInt(postId))
    } catch {
      return false
    }
  }

  async getEngagement(_postId: string): Promise<EngagementMetrics> {
    // Telegram doesn't provide post-level metrics through the API
    return {
      likes: 0,
      shares: 0,
      replies: 0,
      reach: 0,
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    if (!this.bot || !this.channelId) {
      throw new Error('Telegram adapter not initialized')
    }

    const message = await this.bot.sendMessage(this.channelId, content.text, {
      reply_to_message_id: parseInt(postId),
    })

    return {
      id: message.message_id.toString(),
      platform: Platform.TELEGRAM,
      timestamp: new Date(message.date * 1000),
      metadata: message,
    }
  }

  async getFollowerCount(): Promise<number> {
    if (!this.bot || !this.channelId) {
      throw new Error('Telegram adapter not initialized')
    }

    try {
      return await this.bot.getChatMemberCount(this.channelId)
    } catch {
      return 0
    }
  }

  getPlatformSpecificFeatures(): Record<string, unknown> {
    return {
      maxCharacters: 4096,
      canSchedule: false,
      mediaTypes: ['image', 'video'],
      features: ['inline_keyboard', 'message_threads'],
    }
  }

  async schedule(content: PostContent, publishAt: Date): Promise<PostResponse> {
    throw new Error('Telegram does not support scheduling posts')
  }

  async getReachMetrics(postId: string): Promise<number> {
    if (!this.bot || !this.channelId) {
      throw new Error('Telegram adapter not initialized')
    }

    try {
      const message = await this.bot.getChat(this.channelId)
      return 0 // Telegram doesn't provide view counts
    } catch {
      return 0
    }
  }
}
