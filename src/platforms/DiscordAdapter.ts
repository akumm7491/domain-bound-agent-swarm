import {
  Client,
  GatewayIntentBits,
  TextChannel,
  Message,
  AttachmentBuilder,
} from 'discord.js'
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
  private config: DiscordConfig | null = null
  private messageCache: Map<string, Message> = new Map()

  async initialize(config: DiscordConfig): Promise<void> {
    this.config = config
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
    })

    // Set up event handlers
    this.client.on('messageCreate', message => {
      if (!message.author.bot) {
        this.messageCache.set(message.id, message)
      }
    })

    // Login and wait for ready
    await this.client.login(config.botToken)
    await new Promise<void>(resolve => {
      this.client?.once('ready', () => resolve())
    })
  }

  async isAuthenticated(): Promise<boolean> {
    return this.client?.isReady() ?? false
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.client || !this.config) {
      throw new Error('Discord client not initialized')
    }

    const channel = await this.getChannel()
    let message: Message

    try {
      if (content.media && content.media.length > 0) {
        message = await this.sendMediaContent(channel, content)
      } else {
        message = await channel.send(content.text)
      }
    } catch (error) {
      throw new Error(
        `Failed to send Discord message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }

    return this.createPostResponse(message)
  }

  async schedule(
    _content: PostContent,
    _publishAt: Date,
  ): Promise<PostResponse> {
    // Discord doesn't support native scheduling
    // We'll need to implement this using a job queue
    throw new Error('Scheduling not implemented for Discord')
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.client) throw new Error('Discord client not initialized')

    try {
      const channel = await this.getChannel()
      const message = await channel.messages.fetch(postId)
      await message.delete()
      return true
    } catch {
      return false
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    const message = await this.fetchMessage(postId)

    return {
      likes: message.reactions.cache.reduce(
        (acc, reaction) => acc + reaction.count,
        0,
      ),
      shares: 0, // Discord doesn't have native sharing
      replies: message.thread?.messageCount ?? 0,
      reach: 0, // Not available in Discord
      platformSpecific: {
        reactions: Object.fromEntries(
          message.reactions.cache.map(r => [r.emoji.name, r.count]),
        ),
      },
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    const message = await this.fetchMessage(postId)
    const reply = await message.reply(content.text)
    return this.createPostResponse(reply)
  }

  async getFollowerCount(): Promise<number> {
    const channel = await this.getChannel()
    return channel.guild.memberCount
  }

  async getReachMetrics(_postId: string): Promise<number> {
    // Discord doesn't provide view/reach metrics
    return 0
  }

  getPlatformSpecificFeatures(): Record<string, any> {
    return {
      canSchedule: false,
      maxCharacters: 2000,
      mediaTypes: ['image', 'video', 'file'],
      maxMediaPerPost: 10,
      features: ['threads', 'reactions', 'embeds'],
    }
  }

  private async getChannel(): Promise<TextChannel> {
    if (!this.client || !this.config) {
      throw new Error('Discord client not initialized')
    }

    const channel = await this.client.channels.fetch(this.config.channelId)
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error('Invalid Discord channel')
    }

    return channel
  }

  private async fetchMessage(messageId: string): Promise<Message> {
    try {
      const cached = this.messageCache.get(messageId)
      if (cached) return cached

      const channel = await this.getChannel()
      const message = await channel.messages.fetch(messageId)

      if (!message) {
        throw new Error(`Message ${messageId} not found`)
      }

      return message
    } catch (error) {
      throw new Error(
        `Failed to fetch Discord message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private async sendMediaContent(
    channel: TextChannel,
    content: PostContent,
  ): Promise<Message> {
    if (!content.media) {
      throw new Error('No media content provided')
    }

    try {
      const attachments = await Promise.all(
        content.media.map(async media => {
          return new AttachmentBuilder(media.url)
        }),
      )

      const message = await channel.send({
        content: content.text,
        files: attachments,
      })

      if (!message) {
        throw new Error('Failed to send media message')
      }

      return message
    } catch (error) {
      throw new Error(
        `Failed to send Discord media message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      )
    }
  }

  private createPostResponse(message: Message): PostResponse {
    return {
      id: message.id,
      platform: Platform.DISCORD,
      timestamp: message.createdAt,
      url: message.url,
      metadata: {
        channelId: message.channelId,
        guildId: message.guildId,
        authorId: message.author.id,
      },
    }
  }
}
