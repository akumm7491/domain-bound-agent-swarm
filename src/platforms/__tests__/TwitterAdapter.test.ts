import { TwitterApi } from 'twitter-api-v2'
import { Platform } from '../../domain/types'
import { TwitterAdapter, TwitterConfig } from '../TwitterAdapter'
import { PostContent } from '../PlatformAdapter'

// Mock twitter-api-v2
jest.mock('twitter-api-v2')

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter
  let mockConfig: TwitterConfig

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-key',
      apiSecret: 'test-secret',
      accessToken: 'test-token',
      accessTokenSecret: 'test-token-secret',
    }
    adapter = new TwitterAdapter()

    // Reset all mocks
    jest.clearAllMocks()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      await adapter.initialize(mockConfig)
      expect(TwitterApi).toHaveBeenCalledWith({
        appKey: mockConfig.apiKey,
        appSecret: mockConfig.apiSecret,
        accessToken: mockConfig.accessToken,
        accessSecret: mockConfig.accessTokenSecret,
      })
    })

    test('should verify authentication', async () => {
      const mockMe = jest.fn().mockResolvedValue({ data: { id: '123' } })
      ;(TwitterApi as jest.Mock).mockImplementation(() => ({
        v2: { me: mockMe },
      }))

      await adapter.initialize(mockConfig)
      const isAuth = await adapter.isAuthenticated()

      expect(isAuth).toBe(true)
      expect(mockMe).toHaveBeenCalled()
    })
  })

  describe('posting', () => {
    const mockContent: PostContent = {
      text: 'Test tweet',
      media: [{ type: 'image', url: 'https://example.com/image.jpg' }],
    }

    beforeEach(async () => {
      const mockTweet = jest.fn().mockResolvedValue({
        data: { id: '123', text: mockContent.text },
      })
      const mockUploadMedia = jest.fn().mockResolvedValue('media123')

      ;(TwitterApi as jest.Mock).mockImplementation(() => ({
        v2: { tweet: mockTweet, me: jest.fn() },
        v1: { uploadMedia: mockUploadMedia },
      }))

      await adapter.initialize(mockConfig)
    })

    test('should post content with media', async () => {
      const response = await adapter.post(mockContent)

      expect(response.platform).toBe(Platform.TWITTER)
      expect(response.id).toBe('123')
      expect(response.url).toContain('123')
    })

    test('should handle post without media', async () => {
      const textOnlyContent: PostContent = { text: 'Text only tweet' }
      const response = await adapter.post(textOnlyContent)

      expect(response.platform).toBe(Platform.TWITTER)
      expect(response.id).toBe('123')
    })

    test('should throw error when not initialized', async () => {
      adapter = new TwitterAdapter()
      await expect(adapter.post(mockContent)).rejects.toThrow('not initialized')
    })
  })

  describe('engagement', () => {
    beforeEach(async () => {
      const mockSingleTweet = jest.fn().mockResolvedValue({
        data: {
          public_metrics: {
            like_count: 10,
            retweet_count: 5,
            reply_count: 3,
            quote_count: 2,
            impression_count: 100,
          },
        },
      })

      ;(TwitterApi as jest.Mock).mockImplementation(() => ({
        v2: { singleTweet: mockSingleTweet, me: jest.fn() },
      }))

      await adapter.initialize(mockConfig)
    })

    test('should get engagement metrics', async () => {
      const metrics = await adapter.getEngagement('123')

      expect(metrics.likes).toBe(10)
      expect(metrics.shares).toBe(5)
      expect(metrics.replies).toBe(3)
      expect(metrics.reach).toBe(100)
      expect(metrics.platformSpecific?.quotes).toBe(2)
    })
  })

  describe('platform features', () => {
    test('should return Twitter-specific features', () => {
      const features = adapter.getPlatformSpecificFeatures()

      expect(features.maxCharacters).toBe(280)
      expect(features.canSchedule).toBe(false)
      expect(features.mediaTypes).toContain('image')
      expect(features.mediaTypes).toContain('video')
      expect(features.maxMediaPerPost).toBe(4)
    })
  })
})
