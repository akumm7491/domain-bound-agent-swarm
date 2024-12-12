import { Client, TextChannel, Message, Collection } from 'discord.js'
import { Platform } from '../domain/types'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
  EngagementMetrics,
} from './PlatformAdapter'

export interface DiscordConfig {
  botToken: string
  clientId: string
  channelId: string
}

export class DiscordAdapter implements PlatformAdapter {
  platform = Platform.DISCORD
  private client: Client | null = null
  private channelId: string | null = null

  async initialize(config: DiscordConfig): Promise<void> {
    this.client = new Client({
      intents: ['GuildMessages', 'MessageContent', 'Guilds'],
    })
    this.channelId = config.channelId

    await this.client.login(config.botToken)
    await new Promise(resolve => this.client!.once('ready', resolve))
  }

  async isAuthenticated(): Promise<boolean> {
    return this.client?.isReady() || false
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    const channel = (await this.client.channels.fetch(
      this.channelId,
    )) as TextChannel

    const message = await channel.send(content.text)

    return {
      id: message.id,
      platform: Platform.DISCORD,
      timestamp: message.createdAt,
      url: message.url,
      metadata: message,
    }
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    try {
      const channel = (await this.client.channels.fetch(
        this.channelId,
      )) as TextChannel
      const message = await channel.messages.fetch(postId)
      await message.delete()
      return true
    } catch {
      return false
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    try {
      const channel = (await this.client.channels.fetch(
        this.channelId,
      )) as TextChannel
      const message = await channel.messages.fetch(postId)

      const reactions = message.reactions.cache
      const reactionCounts: Record<string, number> = {}

      reactions.forEach((reaction, emoji) => {
        if (reaction.emoji.name) {
          reactionCounts[reaction.emoji.name] = reaction.count || 0
        }
      })

      const totalLikes = Array.from(reactions.values()).reduce(
        (sum, reaction) => sum + (reaction.count || 0),
        0,
      )

      return {
        likes: totalLikes,
        shares: 0, // Discord doesn't have native sharing
        replies: message.thread?.messageCount || 0,
        reach: 0, // Discord doesn't provide view counts
        platformSpecific: {
          reactions: reactionCounts,
        },
      }
    } catch {
      return {
        likes: 0,
        shares: 0,
        replies: 0,
        reach: 0,
        platformSpecific: {
          reactions: {},
        },
      }
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    const channel = (await this.client.channels.fetch(
      this.channelId,
    )) as TextChannel
    const message = await channel.messages.fetch(postId)
    const reply = await message.reply(content.text)

    return {
      id: reply.id,
      platform: Platform.DISCORD,
      timestamp: reply.createdAt,
      url: reply.url,
      metadata: reply,
    }
  }

  async getFollowerCount(): Promise<number> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    const channel = (await this.client.channels.fetch(
      this.channelId,
    )) as TextChannel
    return channel.guild.memberCount
  }

  getPlatformSpecificFeatures(): Record<string, unknown> {
    return {
      maxCharacters: 2000,
      canSchedule: false,
      mediaTypes: ['image', 'video'],
      features: ['threads', 'reactions'],
    }
  }

  async schedule(content: PostContent, publishAt: Date): Promise<PostResponse> {
    throw new Error('Discord does not support scheduling posts')
  }

  async getReachMetrics(postId: string): Promise<number> {
    if (!this.client || !this.channelId) {
      throw new Error('Discord adapter not initialized')
    }

    try {
      const channel = (await this.client.channels.fetch(
        this.channelId,
      )) as TextChannel
      const message = await channel.messages.fetch(postId)
      return 0 // Discord doesn't provide view counts
    } catch {
      return 0
    }
  }
}
