export enum Platform {
  TWITTER = 'twitter',
  TELEGRAM = 'telegram',
  DISCORD = 'discord',
}

export interface AgentProfile {
  id: string
  name: string
  description: string
  tone: string
  languageStyle: string
  personalityTraits: string[]
}

export interface ContentStrategy {
  postFrequency: number
  topicWeights: Map<string, number>
  contentTypes: string[]
  engagementRules: {
    replyStrategy: string
    retweetPolicy: string
    mentionHandling: string
  }
}

export interface AffiliateMetrics {
  totalEarnings: number
  premiumReferrals: number
  fragmentReferrals: number
  activeUsers: number
  conversionRate: number
  lastUpdated: Date
}

export interface AffiliateLink {
  id: string
  platform: Platform
  url: string
  type: 'PREMIUM' | 'FRAGMENT'
  createdAt: Date
  metrics: AffiliateMetrics
}

export interface Analytics {
  engagementRate: number
  followerGrowth: number
  contentPerformance: Map<string, number>
  audienceInsights: {
    demographics: Map<string, number>
    activeHours: number[]
    topInterests: string[]
  }
  affiliateMetrics?: AffiliateMetrics
}

export interface SocialAgent {
  id: string
  domain: string
  personality: AgentProfile
  platforms: Platform[]
  contentStrategy: ContentStrategy
  analytics: Analytics
}
