import { Client } from 'twitter-api-sdk'
import { Platform } from '../../domain/types'
import { TwitterAdapter, TwitterConfig } from '../TwitterAdapter'
import { PostContent } from '../PlatformAdapter'

jest.mock('twitter-api-sdk')

describe('TwitterAdapter', () => {
  let adapter: TwitterAdapter
  let mockClient: jest.Mocked<Client>
  let mockTweet: any

  beforeEach(() => {
    // Set up mock tweet
    mockTweet = {
      data: {
        id: '123456789',
        text: 'Test tweet',
        created_at: new Date().toISOString(),
        public_metrics: {
          like_count: 10,
          retweet_count: 5,
          reply_count: 3,
          quote_count: 5,
        },
      },
    }

    // Set up mock client
    mockClient = {
      tweets: {
        createTweet: jest.fn().mockResolvedValue(mockTweet),
        findTweetById: jest.fn().mockResolvedValue(mockTweet),
        deleteTweetById: jest
          .fn()
          .mockResolvedValue({ data: { deleted: true } }),
      } as any,
      users: {
        findMyUser: jest.fn().mockResolvedValue({
          data: {
            id: '12345',
            name: 'Test User',
            username: 'testuser',
            public_metrics: {
              followers_count: 1000,
              following_count: 500,
              tweet_count: 1000,
            },
          },
        }),
      },
    } as unknown as jest.Mocked<Client>
    ;(Client as unknown as jest.Mock).mockImplementation(() => mockClient)

    adapter = new TwitterAdapter()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)
      expect(Client).toHaveBeenCalledWith(config.apiKey)
    })

    test('should verify authentication', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)
      const isAuthenticated = await adapter.isAuthenticated()
      expect(isAuthenticated).toBe(true)
      expect(mockClient.users.findMyUser).toHaveBeenCalled()
    })
  })

  describe('posting', () => {
    test('should post text content', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)

      const content: PostContent = {
        text: 'Test tweet',
      }

      const response = await adapter.post(content)
      expect(mockClient.tweets.createTweet).toHaveBeenCalledWith({
        text: content.text,
      })
      expect(response.id).toBe('123456789')
    })

    test('should delete tweet', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)

      const success = await adapter.delete('123456789')
      expect(success).toBe(true)
      expect(mockClient.tweets.deleteTweetById).toHaveBeenCalledWith(
        '123456789',
      )
    })

    test('should handle media content', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)

      const content: PostContent = {
        text: 'Test tweet with media',
        media: [
          {
            type: 'image' as const,
            url: 'media_123',
          },
        ],
      }

      await adapter.post(content)
      expect(mockClient.tweets.createTweet).toHaveBeenCalledWith({
        text: content.text,
        media: {
          media_ids: ['media_123'],
        },
      })
    })
  })

  describe('engagement', () => {
    test('should get engagement metrics', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)

      const metrics = await adapter.getEngagement('123456789')
      expect(mockClient.tweets.findTweetById).toHaveBeenCalledWith(
        '123456789',
        {
          'tweet.fields': ['public_metrics'],
        },
      )
      expect(metrics.likes).toBe(10)
      expect(metrics.shares).toBe(5)
      expect(metrics.replies).toBe(3)
      expect(metrics.reach).toBe(10)
    })

    test('should get follower count', async () => {
      const config: TwitterConfig = {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
      }

      await adapter.initialize(config)

      const count = await adapter.getFollowerCount()
      expect(mockClient.users.findMyUser).toHaveBeenCalledWith({
        'user.fields': ['public_metrics'],
      })
      expect(count).toBe(1000)
    })
  })

  describe('platform features', () => {
    test('should return Twitter-specific features', () => {
      const features = adapter.getPlatformSpecificFeatures()
      expect(features).toEqual({
        maxCharacters: 280,
        canSchedule: true,
        mediaTypes: ['image', 'video'],
        features: ['threads', 'polls'],
      })
    })
  })
})
