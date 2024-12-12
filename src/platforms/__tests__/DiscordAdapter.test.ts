import {
  Client,
  TextChannel,
  Message,
  Collection,
  User,
  ReactionManager,
  MessageReaction,
} from 'discord.js'
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
  let mockMessage: jest.Mocked<Message>
  let mockUser: Partial<User>
  let mockReactionManager: any
  let mockReactionCollection: Collection<string, MessageReaction>

  beforeEach(() => {
    mockConfig = {
      botToken: 'test-token',
      clientId: 'test-client',
      channelId: 'test-channel',
    }

    // Set up mock user
    mockUser = {
      id: 'test-author',
      bot: false,
      username: 'test-user',
      discriminator: '1234',
      tag: 'test-user#1234',
      toString: () => '<@test-author>',
      valueOf: () => 'test-author',
    }

    // Set up mock reactions
    mockReactionCollection = new Map() as unknown as Collection<
      string,
      MessageReaction
    >
    const mockReaction = {
      count: 10,
      emoji: { name: '👍' },
    } as unknown as MessageReaction
    mockReactionCollection.set('👍', mockReaction)

    mockReactionManager = {
      cache: mockReactionCollection,
    }

    // Set up mock message
    mockMessage = {
      id: '123456789',
      createdAt: new Date(),
      url: 'https://discord.com/channels/123/456/789',
      delete: jest.fn().mockResolvedValue(undefined),
      reply: jest.fn().mockResolvedValue({
        id: '987654321',
        createdAt: new Date(),
        url: 'https://discord.com/channels/123/456/987',
      }),
      thread: {
        messageCount: 5,
      },
    } as unknown as jest.Mocked<Message>

    mockMessage.reactions = mockReactionManager

    // Set up mock channel
    mockChannel = {
      id: '456',
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
    ;(Client as jest.MockedClass<typeof Client>).mockImplementation(
      () => mockClient,
    )

    adapter = new DiscordAdapter()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      await adapter.initialize(mockConfig)
      expect(Client).toHaveBeenCalledWith({
        intents: ['GuildMessages', 'MessageContent', 'Guilds'],
      })
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
      expect(response.id).toBe('123456789')
      expect(mockChannel.send).toHaveBeenCalledWith(content.text)
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
      const metrics = await adapter.getEngagement('123456789')

      expect(metrics.likes).toBe(10)
      expect(metrics.shares).toBe(0)
      expect(metrics.replies).toBe(5)
      expect(metrics.platformSpecific?.reactions).toEqual({ '👍': 10 })
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
      const success = await adapter.delete('123456789')
      expect(success).toBe(true)
      expect(mockMessage.delete).toHaveBeenCalled()
    })

    test('should reply to message', async () => {
      const content: PostContent = { text: 'Reply message' }
      const response = await adapter.reply('123456789', content)

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
