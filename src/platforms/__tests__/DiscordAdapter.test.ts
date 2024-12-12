import { Client, TextChannel, Message, Collection } from 'discord.js'
import { Platform } from '../../domain/types'
import { DiscordAdapter, DiscordConfig } from '../DiscordAdapter'
import { PostContent } from '../PlatformAdapter'

// Mock discord.js
jest.mock('discord.js')

describe('DiscordAdapter', () => {
  let adapter: DiscordAdapter
  let mockConfig: DiscordConfig
  let mockClient: jest.Mocked<Client>
  let mockChannel: jest.Mocked<TextChannel>
  let mockMessage: Partial<Message>

  beforeEach(() => {
    mockConfig = {
      botToken: 'test-token',
      clientId: 'test-client',
      channelId: 'test-channel',
    }

    // Set up mock message
    mockMessage = {
      id: '123',
      content: 'Test message',
      createdAt: new Date(),
      url: 'https://discord.com/channels/123/456/789',
      channelId: mockConfig.channelId,
      guildId: 'test-guild',
      author: { id: 'test-author', bot: false },
      reply: jest.fn().mockResolvedValue({ ...mockMessage, id: '124' }),
      delete: jest.fn().mockResolvedValue(undefined),
      reactions: {
        cache: new Collection([
          ['👍', { count: 5, emoji: { name: '👍' } }],
          ['❤️', { count: 3, emoji: { name: '❤️' } }],
        ]),
      },
      thread: {
        messageCount: 10,
      },
    }

    // Set up mock channel
    mockChannel = {
      send: jest.fn().mockResolvedValue(mockMessage),
      messages: {
        fetch: jest.fn().mockResolvedValue(mockMessage),
      },
      guild: {
        memberCount: 1000,
      },
    } as unknown as jest.Mocked<TextChannel>

    // Set up mock client
    mockClient = {
      login: jest.fn().mockResolvedValue('token'),
      isReady: jest.fn().mockReturnValue(true),
      on: jest.fn(),
      once: jest.fn().mockImplementation((event, cb) => cb()),
      channels: {
        fetch: jest.fn().mockResolvedValue(mockChannel),
      },
    } as unknown as jest.Mocked<Client>
    ;(Client as jest.Mock).mockImplementation(() => mockClient)

    adapter = new DiscordAdapter()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      await adapter.initialize(mockConfig)
      expect(Client).toHaveBeenCalled()
      expect(mockClient.login).toHaveBeenCalledWith(mockConfig.botToken)
    })

    test('should verify authentication', async () => {
      await adapter.initialize(mockConfig)
      const isAuth = await adapter.isAuthenticated()
      expect(isAuth).toBe(true)
      expect(mockClient.isReady).toHaveBeenCalled()
    })
  })

  describe('posting', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should post text content', async () => {
      const content: PostContent = { text: 'Test message' }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.DISCORD)
      expect(response.id).toBe('123')
      expect(mockChannel.send).toHaveBeenCalledWith(content.text)
    })

    test('should post media content', async () => {
      const content: PostContent = {
        text: 'Test with media',
        media: [{ type: 'image', url: 'https://example.com/image.jpg' }],
      }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.DISCORD)
      expect(response.id).toBe('123')
      expect(mockChannel.send).toHaveBeenCalled()
    })

    test('should throw error when not initialized', async () => {
      adapter = new DiscordAdapter()
      const content: PostContent = { text: 'Test message' }
      await expect(adapter.post(content)).rejects.toThrow('not initialized')
    })
  })

  describe('engagement', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should get engagement metrics', async () => {
      const metrics = await adapter.getEngagement('123')

      expect(metrics.likes).toBe(8) // Total reactions (5 + 3)
      expect(metrics.replies).toBe(10)
      expect(metrics.platformSpecific?.reactions).toEqual({
        '👍': 5,
        '❤️': 3,
      })
    })

    test('should get follower count', async () => {
      const count = await adapter.getFollowerCount()
      expect(count).toBe(1000)
    })
  })

  describe('message management', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should delete message', async () => {
      const success = await adapter.delete('123')
      expect(success).toBe(true)
      expect(mockMessage.delete).toHaveBeenCalled()
    })

    test('should reply to message', async () => {
      const content: PostContent = { text: 'Reply message' }
      const response = await adapter.reply('123', content)

      expect(response.platform).toBe(Platform.DISCORD)
      expect(mockMessage.reply).toHaveBeenCalledWith(content.text)
    })
  })

  describe('platform features', () => {
    test('should return Discord-specific features', () => {
      const features = adapter.getPlatformSpecificFeatures()

      expect(features.maxCharacters).toBe(2000)
      expect(features.canSchedule).toBe(false)
      expect(features.mediaTypes).toContain('image')
      expect(features.mediaTypes).toContain('video')
      expect(features.features).toContain('threads')
      expect(features.features).toContain('reactions')
    })
  })
})
