import { EventBus, EventType } from '../../events/EventBus'
import { Platform } from '../../domain/types'
import { AgentRuntime, AgentRuntimeConfig } from '../AgentRuntime'
import { AgentFactory } from '../AgentFactory'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
} from '../../platforms/PlatformAdapter'
import {
  ContentGenerator,
  ContentTemplate,
} from '../../content/ContentGenerator'
import Queue from 'bull'

// Mock dependencies
jest.mock('bull')
jest.mock('winston', () => ({
  createLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
  }),
  format: {
    json: jest.fn(),
    simple: jest.fn(),
  },
  transports: {
    Console: jest.fn(),
  },
}))
jest.mock('../../content/ContentGenerator')

describe('AgentRuntime', () => {
  let runtime: AgentRuntime
  let mockConfig: AgentRuntimeConfig
  let mockFactory: AgentFactory
  let mockAdapter: jest.Mocked<PlatformAdapter>
  let mockQueue: jest.Mocked<Queue.Queue>
  let eventBus: EventBus
  let mockContentGenerator: jest.Mocked<ContentGenerator>

  beforeEach(() => {
    mockConfig = {
      redis: {
        url: 'redis://localhost:6379',
      },
      contentGeneration: {
        interval: 3600000,
        maxPostsPerDay: 24,
      },
      openai: {
        apiKey: 'test-api-key',
      },
    }

    // Mock Queue
    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      process: jest.fn(),
      getJobs: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Queue.Queue>
    ;(Queue as unknown as jest.Mock).mockImplementation(() => mockQueue)

    // Mock PlatformAdapter
    mockAdapter = {
      platform: Platform.TWITTER,
      initialize: jest.fn().mockResolvedValue(undefined),
      isAuthenticated: jest.fn().mockResolvedValue(true),
      post: jest.fn().mockImplementation(
        async (content: PostContent): Promise<PostResponse> => ({
          id: '123',
          platform: Platform.TWITTER,
          timestamp: new Date(),
          url: 'https://example.com/post/123',
          metadata: { content },
        }),
      ),
      getEngagement: jest.fn().mockResolvedValue({
        likes: 10,
        shares: 5,
        replies: 3,
        reach: 100,
      }),
    } as unknown as jest.Mocked<PlatformAdapter>

    // Mock ContentGenerator
    const mockTemplate: ContentTemplate = {
      id: 'news-update',
      name: 'News Update',
      description: 'Share latest news',
      prompt: 'Create news about {topic}',
      variables: ['topic'],
      platforms: [Platform.TWITTER],
      format: {
        maxLength: 280,
      },
    }

    mockContentGenerator = {
      generateContent: jest.fn().mockResolvedValue({
        content: {
          text: 'Generated test content',
          metadata: { template: 'news-update' },
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
      getTemplate: jest.fn().mockReturnValue(mockTemplate),
    } as unknown as jest.Mocked<ContentGenerator>
    ;(ContentGenerator as jest.Mock).mockImplementation(
      () => mockContentGenerator,
    )

    // Mock AgentFactory
    mockFactory = new AgentFactory()
    jest.spyOn(mockFactory, 'createAgent')

    // Get EventBus instance
    eventBus = EventBus.getInstance()
    jest.spyOn(eventBus, 'publish')

    runtime = new AgentRuntime(mockConfig, mockFactory)
  })

  describe('agent management', () => {
    test('should register and start agent', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]

      // Register platform
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      // Register agent
      const agent = await runtime.registerAgent(domain, platforms)
      expect(mockFactory.createAgent).toHaveBeenCalledWith(domain, platforms)
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.STRATEGY_UPDATED,
          agentId: agent.id,
        }),
      )

      // Start agent
      await runtime.startAgent(agent.id)
      expect(mockQueue.add).toHaveBeenCalledWith(
        'generate-content',
        { agentId: agent.id },
        expect.any(Object),
      )
    })

    test('should stop agent', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]
      const agent = await runtime.registerAgent(domain, platforms)

      const mockJob = { remove: jest.fn().mockResolvedValue(undefined) }
      mockQueue.getJobs.mockResolvedValueOnce([
        { ...mockJob, data: { agentId: agent.id } },
      ])

      await runtime.stopAgent(agent.id)
      expect(mockJob.remove).toHaveBeenCalled()
    })
  })

  describe('content generation', () => {
    test('should generate and publish content', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]
      const agent = await runtime.registerAgent(domain, platforms)
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      // Capture the process callback
      const processCallback = (mockQueue.process as jest.Mock).mock.calls[0][1]

      // Execute the callback
      await processCallback({ data: { agentId: agent.id } })

      // Verify content generation
      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          domain,
          platforms,
        }),
      )

      // Verify content publishing
      expect(mockAdapter.post).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Generated test content',
        }),
      )

      // Verify events
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.CONTENT_CREATED,
        }),
      )
      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.CONTENT_PUBLISHED,
        }),
      )
    })

    test('should handle content generation failure', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]
      const agent = await runtime.registerAgent(domain, platforms)
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      mockContentGenerator.generateContent.mockRejectedValueOnce(
        new Error('Generation failed'),
      )

      const processCallback = (mockQueue.process as jest.Mock).mock.calls[0][1]
      await expect(
        processCallback({ data: { agentId: agent.id } }),
      ).rejects.toThrow('Generation failed')

      expect(mockAdapter.post).not.toHaveBeenCalled()
    })

    test('should handle publishing failure', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]
      const agent = await runtime.registerAgent(domain, platforms)
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)

      mockAdapter.post.mockRejectedValueOnce(new Error('Publishing failed'))

      const processCallback = (mockQueue.process as jest.Mock).mock.calls[0][1]
      await processCallback({ data: { agentId: agent.id } })

      expect(eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.CONTENT_CREATED,
        }),
      )
      expect(eventBus.publish).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: EventType.CONTENT_PUBLISHED,
        }),
      )
    })
  })

  describe('platform management', () => {
    test('should register platform adapter', () => {
      runtime.registerPlatform(Platform.TWITTER, mockAdapter)
      expect(mockAdapter.platform).toBe(Platform.TWITTER)
    })

    test('should handle missing platform adapter', async () => {
      const domain = 'crypto'
      const platforms = [Platform.TWITTER]
      const agent = await runtime.registerAgent(domain, platforms)

      const processCallback = (mockQueue.process as jest.Mock).mock.calls[0][1]
      await expect(
        processCallback({ data: { agentId: agent.id } }),
      ).rejects.toThrow('not configured')
    })
  })
})
