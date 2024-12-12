import Bull from 'bull'
import { Platform } from '../../domain/types'
import { AgentFactory } from '../AgentFactory'
import { AgentRuntime, AgentRuntimeConfig } from '../AgentRuntime'
import { EventBus, EventType } from '../../events/EventBus'
import { PlatformAdapter } from '../../platforms/PlatformAdapter'
import { ContentGenerator } from '../../content/ContentGenerator'

// Mock dependencies
jest.mock('bull')
jest.mock('ioredis')
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  }),
  format: {
    json: jest.fn().mockReturnValue({}),
    simple: jest.fn().mockReturnValue({}),
  },
  transports: {
    Console: jest.fn(),
  },
}))
jest.mock('../../events/EventBus')
jest.mock('../AgentFactory')
jest.mock('../../content/ContentGenerator')

describe('AgentRuntime', () => {
  let runtime: AgentRuntime
  let mockConfig: AgentRuntimeConfig
  let mockQueue: jest.Mocked<Bull.Queue>
  let mockFactory: jest.Mocked<AgentFactory>
  let mockAdapter: jest.Mocked<PlatformAdapter>
  let mockContentGenerator: jest.Mocked<ContentGenerator>
  let eventBus: jest.Mocked<EventBus>
  let processCallback: (job: Bull.Job) => Promise<void>

  beforeEach(() => {
    mockConfig = {
      redis: {
        url: 'redis://localhost:6379',
      },
      contentGeneration: {
        interval: 3600000,
        maxPostsPerDay: 10,
      },
      openai: {
        apiKey: 'test-api-key',
      },
    }

    // Set up mock queue
    mockQueue = {
      process: jest.fn().mockImplementation((name: string, cb: any) => {
        processCallback = cb
      }),
      add: jest.fn().mockResolvedValue(undefined),
      resume: jest.fn().mockResolvedValue(undefined),
      pause: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Bull.Queue>
    ;(Bull as unknown as jest.MockedClass<typeof Bull>).mockImplementation(
      () => mockQueue,
    )

    // Set up mock factory
    mockFactory = {
      createAgent: jest.fn().mockReturnValue({
        id: '9645ef86-d228-44d9-8d72-bac32b5aabb5',
        domain: 'crypto',
        platforms: [Platform.TWITTER],
        contentStrategy: {
          frequency: 'hourly',
          topics: ['bitcoin', 'ethereum'],
        },
      }),
    } as unknown as jest.Mocked<AgentFactory>

    // Set up mock adapter
    mockAdapter = {
      platform: Platform.TWITTER,
      post: jest.fn().mockResolvedValue({
        id: '123',
        platform: Platform.TWITTER,
        timestamp: new Date(),
      }),
    } as unknown as jest.Mocked<PlatformAdapter>

    // Set up mock content generator
    mockContentGenerator = {
      generateContent: jest.fn().mockResolvedValue({
        content: {
          text: 'Generated test content',
        },
        variations: [],
        metadata: {
          template: 'news-update',
          generationParams: {},
          performance: {
            expectedEngagement: 80,
            confidenceScore: 70,
          },
        },
      }),
    } as unknown as jest.Mocked<ContentGenerator>
    ;(
      ContentGenerator as jest.MockedClass<typeof ContentGenerator>
    ).mockImplementation(() => mockContentGenerator)

    // Set up mock event bus
    eventBus = {
      publish: jest.fn().mockResolvedValue(undefined),
      subscribe: jest.fn().mockImplementation((type, cb) => {
        if (type === EventType.CONTENT_CREATED) {
          setTimeout(() => {
            cb({
              id: 'test-event',
              type: EventType.CONTENT_CREATED,
              agentId: '9645ef86-d228-44d9-8d72-bac32b5aabb5',
              timestamp: new Date(),
              payload: { text: 'Test content' },
              metadata: {
                domain: 'crypto',
                platform: Platform.TWITTER,
                priority: 1,
              },
            })
          }, 0)
        }
      }),
    } as unknown as jest.Mocked<EventBus>
    ;(EventBus.getInstance as jest.Mock).mockReturnValue(eventBus)

    runtime = new AgentRuntime(mockConfig, mockFactory)
  })

  describe('agent management', () => {
    test('should register and manage agent', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]

      const agent = await runtime.registerAgent(domain, platforms)
      expect(mockFactory.createAgent).toHaveBeenCalledWith(domain, platforms)
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.STRATEGY_UPDATED,
          agentId: agent.id,
        }),
      )

      await runtime.start()
      expect(mockQueue.resume).toHaveBeenCalled()
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-content',
        { agentId: agent.id },
        expect.any(Object),
      )
    })
  })

  describe('content generation', () => {
    test('should generate and publish content', async () => {
      // Set up agent and platform
      const agent = await runtime.registerAgent('crypto', [Platform.TWITTER])
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      mockContentGenerator.generateContent.mockResolvedValueOnce({
        content: {
          text: 'Test content',
        },
        metadata: {
          template: 'news-update',
          generationParams: {
            domain: 'crypto',
            platform: Platform.TWITTER,
          },
          performance: {
            expectedEngagement: 100,
            confidenceScore: 0.8,
          },
        },
        variations: ['Test content variation 1', 'Test content variation 2'],
      })

      const postResponse = {
        id: 'test-post-id',
        platform: Platform.TWITTER,
        url: 'https://twitter.com/test',
        timestamp: new Date(),
      }

      mockAdapter.post.mockResolvedValueOnce(postResponse)

      // Start the runtime
      await runtime.start()

      // Trigger content generation
      await eventBus.subscribe.mock.calls[0][1]({
        id: 'test-event',
        type: EventType.CONTENT_CREATED,
        agentId: agent.id,
        timestamp: new Date(),
        payload: { text: 'Test content' },
        metadata: {
          domain: 'crypto',
          platform: Platform.TWITTER,
          priority: 1,
        },
      })

      // Wait for the event callback to be processed
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(mockAdapter.post).toHaveBeenCalled()

      // Find the content.published event
      const publishedEvent = eventBus.publish.mock.calls.find(
        call => call[0].type === EventType.CONTENT_PUBLISHED,
      )?.[0]

      expect(publishedEvent).toBeDefined()
      expect(publishedEvent?.agentId).toBe(agent.id)
      expect(publishedEvent?.type).toBe(EventType.CONTENT_PUBLISHED)
      expect(publishedEvent?.payload).toEqual({
        text: 'Test content',
      })
    })

    test('should handle content generation failure', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]

      const agent = await runtime.registerAgent(domain, platforms)
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      mockContentGenerator.generateContent.mockRejectedValueOnce(
        new Error('Generation failed'),
      )

      await expect(
        processCallback({
          data: { agentId: agent.id },
          id: 'test-job',
          name: 'generate-content',
          timestamp: Date.now(),
          queue: mockQueue,
          progress: jest.fn(),
          log: jest.fn(),
          update: jest.fn(),
          remove: jest.fn(),
          retry: jest.fn(),
          discard: jest.fn(),
          finished: jest.fn(),
          moveToCompleted: jest.fn(),
          moveToFailed: jest.fn(),
          moveToDelayed: jest.fn(),
          moveToActive: jest.fn(),
          moveToWaiting: jest.fn(),
          takeLock: jest.fn(),
          releaseLock: jest.fn(),
          extendLock: jest.fn(),
          lockKey: null,
          stacktrace: [],
          returnvalue: null,
          processedOn: undefined,
          finishedOn: undefined,
          attemptsMade: 0,
          opts: {},
        } as unknown as Bull.Job),
      ).rejects.toThrow('Generation failed')

      expect(mockAdapter.post).not.toHaveBeenCalled()
    })

    test('should handle publishing failure', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]

      const agent = await runtime.registerAgent(domain, platforms)
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      mockAdapter.post.mockRejectedValueOnce(new Error('Publishing failed'))

      await processCallback({
        data: { agentId: agent.id },
        id: 'test-job',
        name: 'generate-content',
        timestamp: Date.now(),
        queue: mockQueue,
        progress: jest.fn(),
        log: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        retry: jest.fn(),
        discard: jest.fn(),
        finished: jest.fn(),
        moveToCompleted: jest.fn(),
        moveToFailed: jest.fn(),
        moveToDelayed: jest.fn(),
        moveToActive: jest.fn(),
        moveToWaiting: jest.fn(),
        takeLock: jest.fn(),
        releaseLock: jest.fn(),
        extendLock: jest.fn(),
        lockKey: null,
        stacktrace: [],
        returnvalue: null,
        processedOn: undefined,
        finishedOn: undefined,
        attemptsMade: 0,
        opts: {},
      } as unknown as Bull.Job)

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.CONTENT_CREATED,
        }),
      )
    })
  })

  describe('platform management', () => {
    test('should handle missing platform adapter', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]

      const agent = await runtime.registerAgent(domain, platforms)

      await expect(
        processCallback({
          data: { agentId: agent.id },
          id: 'test-job',
          name: 'generate-content',
          timestamp: Date.now(),
          queue: mockQueue,
          progress: jest.fn(),
          log: jest.fn(),
          update: jest.fn(),
          remove: jest.fn(),
          retry: jest.fn(),
          discard: jest.fn(),
          finished: jest.fn(),
          moveToCompleted: jest.fn(),
          moveToFailed: jest.fn(),
          moveToDelayed: jest.fn(),
          moveToActive: jest.fn(),
          moveToWaiting: jest.fn(),
          takeLock: jest.fn(),
          releaseLock: jest.fn(),
          extendLock: jest.fn(),
          lockKey: null,
          stacktrace: [],
          returnvalue: null,
          processedOn: undefined,
          finishedOn: undefined,
          attemptsMade: 0,
          opts: {},
        } as unknown as Bull.Job),
      ).rejects.toThrow('not configured')
    })
  })
})
