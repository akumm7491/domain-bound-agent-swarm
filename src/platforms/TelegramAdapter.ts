import { Telegraf, Context } from 'telegraf'
import { Message } from 'telegraf/typings/core/types/typegram'
import { Platform } from '../domain/types'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
  EngagementMetrics,
} from './PlatformAdapter'
import { AffiliateLink, AffiliateMetrics } from '../domain/types'

// Define the extended message type with optional metrics
interface TelegramMessage extends Partial<Message.TextMessage> {
  reactions?: {
    total_count: number
  }
  forward_count?: number
  reply_count?: number
  views?: number
}

export interface TelegramConfig {
  botToken: string
  channelId?: string
  affiliateToken?: string // Token for affiliate program
}

export class TelegramAdapter implements PlatformAdapter {
  platform = Platform.TELEGRAM
  private bot: Telegraf | null = null
  private config: TelegramConfig | null = null
  private messageCache: Map<string, TelegramMessage> = new Map()
  private affiliateLinks: Map<string, AffiliateLink> = new Map()

  async initialize(config: TelegramConfig): Promise<void> {
    this.config = config
    this.bot = new Telegraf(config.botToken)

    // Initialize bot and set up event handlers
    this.setupMessageHandlers()
    this.setupAffiliateHandlers()

    await this.bot.launch()
  }

  private setupMessageHandlers(): void {
    if (!this.bot) return

    this.bot.on('message', ctx => {
      const messageId = ctx.message.message_id.toString()
      this.messageCache.set(messageId, ctx.message)
    })
  }

  private setupAffiliateHandlers(): void {
    if (!this.bot) return

    // Handle premium subscription commands
    this.bot.command('premium', async ctx => {
      const affiliateLink = await this.createAffiliateLink('PREMIUM')
      await ctx.reply(
        'Get Telegram Premium with special benefits! 🌟\n' +
          'Use this link to subscribe and support our bot:\n' +
          affiliateLink.url,
      )
    })

    // Handle Fragment commands
    this.bot.command('fragment', async ctx => {
      const affiliateLink = await this.createAffiliateLink('FRAGMENT')
      await ctx.reply(
        'Get Telegram Fragment - your unique username! ✨\n' +
          'Use this link to claim your username:\n' +
          affiliateLink.url,
      )
    })

    // Track affiliate conversions
    this.bot.on('successful_payment', async ctx => {
      await this.trackAffiliateConversion(ctx)
    })
  }

  async createAffiliateLink(
    type: 'PREMIUM' | 'FRAGMENT',
  ): Promise<AffiliateLink> {
    if (!this.config?.affiliateToken) {
      throw new Error('Affiliate token not configured')
    }

    const baseUrl =
      type === 'PREMIUM' ? 'https://t.me/premium/' : 'https://fragment.com/'

    const affiliateLink: AffiliateLink = {
      id: Math.random().toString(36).substring(7),
      platform: Platform.TELEGRAM,
      url: `${baseUrl}?ref=${this.config.affiliateToken}`,
      type,
      createdAt: new Date(),
      metrics: {
        totalEarnings: 0,
        premiumReferrals: 0,
        fragmentReferrals: 0,
        activeUsers: 0,
        conversionRate: 0,
        lastUpdated: new Date(),
      },
    }

    this.affiliateLinks.set(affiliateLink.id, affiliateLink)
    return affiliateLink
  }

  private async trackAffiliateConversion(ctx: Context): Promise<void> {
    const message = ctx.message
    if (!message || !('successful_payment' in message)) {
      return
    }

    const payment = message.successful_payment
    if (!payment) {
      return
    }

    const affiliateLink = Array.from(this.affiliateLinks.values()).find(link =>
      payment.invoice_payload.includes(link.id),
    )

    if (affiliateLink) {
      affiliateLink.metrics.totalEarnings += payment.total_amount / 100
      if (affiliateLink.type === 'PREMIUM') {
        affiliateLink.metrics.premiumReferrals += 1
      } else {
        affiliateLink.metrics.fragmentReferrals += 1
      }
      affiliateLink.metrics.lastUpdated = new Date()

      // Update conversion rate
      affiliateLink.metrics.conversionRate =
        ((affiliateLink.metrics.premiumReferrals +
          affiliateLink.metrics.fragmentReferrals) /
          affiliateLink.metrics.activeUsers) *
        100
    }
  }

  async getAffiliateMetrics(): Promise<AffiliateMetrics> {
    const totalMetrics: AffiliateMetrics = {
      totalEarnings: 0,
      premiumReferrals: 0,
      fragmentReferrals: 0,
      activeUsers: 0,
      conversionRate: 0,
      lastUpdated: new Date(),
    }

    for (const link of this.affiliateLinks.values()) {
      totalMetrics.totalEarnings += link.metrics.totalEarnings
      totalMetrics.premiumReferrals += link.metrics.premiumReferrals
      totalMetrics.fragmentReferrals += link.metrics.fragmentReferrals
      totalMetrics.activeUsers += link.metrics.activeUsers
    }

    // Calculate overall conversion rate
    const totalReferrals =
      totalMetrics.premiumReferrals + totalMetrics.fragmentReferrals
    totalMetrics.conversionRate =
      totalMetrics.activeUsers > 0
        ? (totalReferrals / totalMetrics.activeUsers) * 100
        : 0

    return totalMetrics
  }

  async isAuthenticated(): Promise<boolean> {
    if (!this.bot) return false
    try {
      const me = await this.bot.telegram.getMe()
      return !!me.id
    } catch {
      return false
    }
  }

  async post(content: PostContent): Promise<PostResponse> {
    if (!this.bot) throw new Error('Telegram bot not initialized')

    const target = this.config?.channelId || ''
    let message: Message

    if (content.media && content.media.length > 0) {
      message = await this.sendMediaContent(target, content)
    } else {
      message = await this.bot.telegram.sendMessage(target, content.text, {
        parse_mode: 'HTML',
      })
    }

    if (!message) {
      throw new Error('Failed to send message')
    }

    return {
      id: message.message_id.toString(),
      platform: Platform.TELEGRAM,
      timestamp: new Date(message.date * 1000),
      url: this.getMessageUrl(message),
      metadata: message,
    }
  }

  async schedule(
    _content: PostContent,
    _publishAt: Date,
  ): Promise<PostResponse> {
    // Telegram doesn't support native scheduling
    // We'll need to implement this using a job queue
    throw new Error('Scheduling not implemented for Telegram')
  }

  async delete(postId: string): Promise<boolean> {
    if (!this.bot) throw new Error('Telegram bot not initialized')

    try {
      const target = this.config?.channelId || ''
      await this.bot.telegram.deleteMessage(target, parseInt(postId))
      return true
    } catch {
      return false
    }
  }

  async getEngagement(postId: string): Promise<EngagementMetrics> {
    const message = this.messageCache.get(postId) as TelegramMessage

    return {
      likes: message?.reactions?.total_count || 0,
      shares: message?.forward_count || 0,
      replies: message?.reply_count || 0,
      reach: 0,
      platformSpecific: {
        views: message?.views || 0,
      },
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    if (!this.bot) throw new Error('Telegram bot not initialized')

    const target = this.config?.channelId || ''
    const message = await this.bot.telegram.sendMessage(target, content.text, {
      parse_mode: 'HTML',
      reply_parameters: { message_id: parseInt(postId, 10) },
    })

    return {
      id: message.message_id.toString(),
      platform: Platform.TELEGRAM,
      timestamp: new Date(message.date * 1000),
      url: this.getMessageUrl(message),
      metadata: { ...message, replyTo: postId },
    }
  }

  async getFollowerCount(): Promise<number> {
    if (!this.bot || !this.config?.channelId) return 0

    try {
      const chatMember = await this.bot.telegram.getChatMembersCount(
        this.config.channelId,
      )
      return chatMember
    } catch {
      return 0
    }
  }

  async getReachMetrics(postId: string): Promise<number> {
    const message = this.messageCache.get(postId)
    return message?.views || 0
  }

  getPlatformSpecificFeatures(): Record<string, any> {
    return {
      canSchedule: false,
      maxCharacters: 4096,
      mediaTypes: ['image', 'video', 'animation', 'document'],
      maxMediaPerPost: 10,
      supportedFormats: ['HTML'],
    }
  }

  private async sendMediaContent(
    target: string,
    content: PostContent,
  ): Promise<Message> {
    if (!this.bot || !content.media) throw new Error('Invalid media content')

    const media = content.media[0]

    switch (media.type) {
      case 'image':
        return await this.bot.telegram.sendPhoto(target, media.url, {
          caption: content.text,
          parse_mode: 'HTML',
        })
      case 'video':
        return await this.bot.telegram.sendVideo(target, media.url, {
          caption: content.text,
          parse_mode: 'HTML',
        })
      default:
        throw new Error(`Unsupported media type: ${media.type}`)
    }
  }

  private getMessageUrl(message: Message): string {
    if (!this.config?.channelId) return ''
    const channelId = this.config.channelId.replace('@', '')
    return `https://t.me/${channelId}/${message.message_id}`
  }
}
