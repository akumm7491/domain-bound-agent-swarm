import { Platform, SocialAgent } from '../domain/types'
import { AgentFactory } from './AgentFactory'
import { PlatformAdapter } from '../platforms/PlatformAdapter'
import { EventBus, EventType } from '../events/EventBus'
import Bull from 'bull'
import Redis from 'ioredis'
import winston from 'winston'
import { ContentGenerator } from '../content/ContentGenerator'

export interface AgentRuntimeConfig {
  redis: {
    url: string
  }
  contentGeneration: {
    interval: number
    maxPostsPerDay: number
  }
  openai: {
    apiKey: string
  }
}

export class AgentRuntime {
  private agents: Map<string, SocialAgent> = new Map()
  private platforms: Map<Platform, PlatformAdapter> = new Map()
  private contentQueue: Bull.Queue
  private redis: Redis
  private logger: winston.Logger
  private eventBus: EventBus
  private contentGenerator: ContentGenerator

  constructor(
    config: AgentRuntimeConfig,
    private agentFactory: AgentFactory,
  ) {
    this.redis = new Redis(config.redis.url)
    this.contentQueue = new Bull('content-generation', config.redis.url)
    this.eventBus = EventBus.getInstance()
    this.contentGenerator = new ContentGenerator({
      openai: {
        apiKey: config.openai.apiKey,
        model: 'gpt-4',
      },
      templates: [
        {
          id: 'news-update',
          name: 'News Update',
          description: 'Share latest news',
          prompt: 'Create news about {topic}',
          variables: ['topic'],
          platforms: [Platform.TWITTER],
          format: {
            maxLength: 280,
          },
        },
      ],
    })

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ],
    })

    this.setupEventHandlers()
    this.setupContentQueue(config.contentGeneration)
  }

  registerAgent(domain: string, platforms: Platform[]): SocialAgent {
    const agent = this.agentFactory.createAgent(domain, platforms)
    this.agents.set(agent.id, agent)

    // Publish strategy update event
    this.eventBus.publish({
      id: Math.random().toString(36).substring(7),
      type: EventType.STRATEGY_UPDATED,
      agentId: agent.id,
      timestamp: new Date(),
      payload: agent.contentStrategy,
      metadata: {
        domain: agent.domain,
        platform: platforms[0],
        priority: 1,
      },
    })

    // Schedule content generation for this agent
    this.contentQueue.add(
      'generate-content',
      { agentId: agent.id },
      {
        repeat: {
          every: 3600000, // 1 hour
        },
      },
    )

    return agent
  }

  registerPlatform(platform: Platform, adapter: PlatformAdapter): void {
    this.platforms.set(platform, adapter)
  }

  getPlatformAdapter(platform: Platform): PlatformAdapter | undefined {
    return this.platforms.get(platform)
  }

  private setupEventHandlers(): void {
    this.eventBus.subscribe(EventType.CONTENT_CREATED, async event => {
      const agent = this.agents.get(event.agentId)
      if (!agent) {
        this.logger.error(`Agent ${event.agentId} not found`)
        return
      }

      try {
        const adapter = this.platforms.get(event.metadata.platform as Platform)
        if (!adapter) {
          throw new Error(`Platform ${event.metadata.platform} not found`)
        }

        await adapter.post(event.payload)
        this.eventBus.publish({
          ...event,
          type: EventType.CONTENT_PUBLISHED,
        })
      } catch (error) {
        this.logger.error('Failed to publish content:', error)
      }
    })
  }

  private setupContentQueue(
    config: AgentRuntimeConfig['contentGeneration'],
  ): void {
    this.contentQueue.process('generate-content', async job => {
      const { agentId } = job.data
      const agent = this.agents.get(agentId)

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`)
      }

      // Generate content for each platform
      for (const platform of agent.platforms) {
        const adapter = this.platforms.get(platform)
        if (!adapter) {
          throw new Error(`Platform ${platform} not configured`)
        }

        try {
          const content = await this.contentGenerator.generateContent({
            templateId: 'news-update',
            variables: {
              domain: agent.domain,
              platform: platform.toString(),
            },
            platforms: [platform],
          })

          // Publish content created event
          await this.eventBus.publish({
            id: Math.random().toString(36).substring(7),
            type: EventType.CONTENT_CREATED,
            agentId: agent.id,
            timestamp: new Date(),
            payload: content.content,
            metadata: {
              domain: agent.domain,
              platform,
              priority: 1,
            },
          })
        } catch (error) {
          this.logger.error(
            `Failed to generate content for agent ${agent.id}:`,
            error,
          )
          throw error
        }
      }
    })
  }

  async start(): Promise<void> {
    this.logger.info('Starting agent runtime...')
    await this.contentQueue.resume()
  }

  async stop(): Promise<void> {
    this.logger.info('Stopping agent runtime...')
    await this.contentQueue.pause()
    await this.contentQueue.close()
    await this.redis.quit()
  }

  getAgent(id: string): SocialAgent | undefined {
    return this.agents.get(id)
  }

  getAllAgents(): SocialAgent[] {
    return Array.from(this.agents.values())
  }
}
