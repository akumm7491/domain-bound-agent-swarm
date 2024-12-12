import { v4 as uuidv4 } from 'uuid'
import {
  SocialAgent,
  Platform,
  AgentProfile,
  ContentStrategy,
  Analytics,
} from '../domain/types'

export class AgentFactory {
  createAgent(domain: string, platforms: Platform[]): SocialAgent {
    return {
      id: uuidv4(),
      domain,
      personality: this.createPersonality(domain),
      platforms,
      contentStrategy: this.createStrategy(),
      analytics: this.createAnalytics(),
    }
  }

  private createPersonality(domain: string): AgentProfile {
    return {
      id: uuidv4(),
      name: `${domain.charAt(0).toUpperCase() + domain.slice(1)}Expert`,
      description: `AI expert in ${domain}`,
      tone: 'professional',
      languageStyle: 'informative',
      personalityTraits: ['knowledgeable', 'helpful', 'engaging'],
    }
  }

  private createStrategy(): ContentStrategy {
    return {
      postFrequency: 4, // posts per day
      topicWeights: new Map([
        ['industry_news', 0.4],
        ['tips', 0.3],
        ['engagement', 0.3],
      ]),
      contentTypes: ['text', 'image', 'link'],
      engagementRules: {
        replyStrategy: 'selective',
        retweetPolicy: 'curated',
        mentionHandling: 'priority',
      },
    }
  }

  private createAnalytics(): Analytics {
    return {
      engagementRate: 0,
      followerGrowth: 0,
      contentPerformance: new Map(),
      audienceInsights: {
        demographics: new Map(),
        activeHours: Array(24).fill(0),
        topInterests: [],
      },
    }
  }
}
