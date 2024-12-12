import { Platform } from '../../domain/types'
import {
  PlatformAdapter,
  PostContent,
  PostResponse,
  EngagementMetrics,
} from '../PlatformAdapter'

// Mock implementation for testing
class MockPlatformAdapter implements PlatformAdapter {
  platform = Platform.TWITTER
  private authenticated = false
  private posts: Map<string, PostResponse> = new Map()

  async initialize(): Promise<void> {
    this.authenticated = true
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated
  }

  async post(content: PostContent): Promise<PostResponse> {
    const response: PostResponse = {
      id: Math.random().toString(36).substring(7),
      platform: this.platform,
      timestamp: new Date(),
      url: 'https://mock.url/post/123',
      metadata: { original: content },
    }
    this.posts.set(response.id, response)
    return response
  }

  async schedule(content: PostContent, publishAt: Date): Promise<PostResponse> {
    const response = await this.post(content)
    response.metadata = { ...response.metadata, scheduledFor: publishAt }
    return response
  }

  async delete(postId: string): Promise<boolean> {
    return this.posts.delete(postId)
  }

  async getEngagement(): Promise<EngagementMetrics> {
    return {
      likes: 10,
      shares: 5,
      replies: 3,
      reach: 100,
    }
  }

  async reply(postId: string, content: PostContent): Promise<PostResponse> {
    const response = await this.post(content)
    response.metadata = { ...response.metadata, replyTo: postId }
    return response
  }

  async getFollowerCount(): Promise<number> {
    return 1000
  }

  async getReachMetrics(): Promise<number> {
    return 500
  }

  getPlatformSpecificFeatures(): Record<string, unknown> {
    return {
      canSchedule: true,
      maxCharacters: 280,
    }
  }
}

describe('PlatformAdapter', () => {
  let adapter: PlatformAdapter

  beforeEach(() => {
    adapter = new MockPlatformAdapter()
  })

  test('should initialize and authenticate', async () => {
    expect(await adapter.isAuthenticated()).toBe(false)
    await adapter.initialize({})
    expect(await adapter.isAuthenticated()).toBe(true)
  })

  test('should post content', async () => {
    const content: PostContent = {
      text: 'Test post',
      media: [{ type: 'image', url: 'https://example.com/image.jpg' }],
    }

    const response = await adapter.post(content)
    expect(response.platform).toBe(Platform.TWITTER)
    expect(response.id).toBeDefined()
    expect(response.timestamp).toBeInstanceOf(Date)
    expect(response.metadata?.original).toEqual(content)
  })

  test('should schedule content', async () => {
    const content: PostContent = { text: 'Scheduled post' }
    const scheduledTime = new Date()

    const response = await adapter.schedule(content, scheduledTime)
    expect(response.metadata?.scheduledFor).toBe(scheduledTime)
  })

  test('should delete content', async () => {
    const content: PostContent = { text: 'To be deleted' }
    const response = await adapter.post(content)

    const deleted: boolean = await adapter.delete(response.id)
    expect(deleted).toBe(true)
  })

  test('should get engagement metrics', async () => {
    const metrics: EngagementMetrics = await adapter.getEngagement('test-id')
    expect(metrics.likes).toBeDefined()
    expect(metrics.shares).toBeDefined()
    expect(metrics.replies).toBeDefined()
    expect(metrics.reach).toBeDefined()
  })
})
