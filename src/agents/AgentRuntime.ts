import { Platform, SocialAgent } from '../domain/types'
import { AgentFactory } from './AgentFactory'
import { PlatformAdapter } from '../platforms/PlatformAdapter'
import { EventBus, EventType } from '../events/EventBus'
import Bull from 'bull'
import Redis from 'ioredis'
import winston from 'winston'

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

  constructor(
    config: AgentRuntimeConfig,
    private agentFactory: AgentFactory,
  ) {
    this.redis = new Redis(config.redis.url)
    this.contentQueue = new Bull('content-generation', config.redis.url)
    this.eventBus = EventBus.getInstance()

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
    this.contentQueue.process(async job => {
      const { agentId } = job.data
      const agent = this.agents.get(agentId)

      if (!agent) {
        throw new Error(`Agent ${agentId} not found`)
      }

      // Process content generation
      // Implementation details...
    })

    // Schedule content generation jobs
    this.contentQueue.add(
      {},
      {
        repeat: {
          every: config.interval,
        },
      },
    )
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
