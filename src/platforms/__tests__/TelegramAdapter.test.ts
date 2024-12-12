import TelegramBot from 'node-telegram-bot-api'
import { Platform } from '../../domain/types'
import { TelegramAdapter, TelegramConfig } from '../TelegramAdapter'
import { PostContent } from '../PlatformAdapter'

// Mock node-telegram-bot-api
jest.mock('node-telegram-bot-api')

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter
  let mockConfig: TelegramConfig
  let mockBot: jest.Mocked<TelegramBot>
  let mockMessage: TelegramBot.Message

  beforeEach(() => {
    mockConfig = {
      botToken: 'test-token',
      channelId: '@test-channel',
    }

    // Set up mock message
    mockMessage = {
      message_id: 123,
      chat: {
        id: parseInt(mockConfig.channelId),
        type: 'channel',
        title: 'Test Channel',
      },
      date: Math.floor(Date.now() / 1000),
      text: 'Test message',
      entities: [],
    }

    // Set up mock bot
    mockBot = {
      sendMessage: jest.fn().mockResolvedValue(mockMessage),
      sendPhoto: jest.fn().mockResolvedValue(mockMessage),
      sendVideo: jest.fn().mockResolvedValue(mockMessage),
      deleteMessage: jest.fn().mockResolvedValue(true),
      getChat: jest.fn().mockResolvedValue({
        id: parseInt(mockConfig.channelId),
        type: 'channel',
        title: 'Test Channel',
        member_count: 1000,
      }),
      getChatMemberCount: jest.fn().mockResolvedValue(1000),
      getMe: jest.fn().mockResolvedValue({
        id: 123,
        is_bot: true,
        first_name: 'Test Bot',
        username: 'test_bot',
      }),
    } as unknown as jest.Mocked<TelegramBot>
    ;(TelegramBot as jest.MockedClass<typeof TelegramBot>).mockImplementation(
      () => mockBot,
    )

    adapter = new TelegramAdapter()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      await adapter.initialize(mockConfig)
      expect(TelegramBot).toHaveBeenCalledWith(mockConfig.botToken, {
        polling: false,
      })
    })

    test('should verify authentication', async () => {
      await adapter.initialize(mockConfig)
      const isAuth = await adapter.isAuthenticated()
      expect(isAuth).toBe(true)
      expect(mockBot.getMe).toHaveBeenCalled()
    })
  })

  describe('posting', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should post text content', async () => {
      const content: PostContent = { text: 'Test message' }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.id).toBe('123')
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.text,
      )
    })

    test('should post image content', async () => {
      const content: PostContent = {
        text: 'Test with image',
        media: [{ type: 'image', url: 'https://example.com/image.jpg' }],
      }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.id).toBe('123')
      expect(mockBot.sendPhoto).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.media![0].url,
        {
          caption: content.text,
        },
      )
    })

    test('should post video content', async () => {
      const content: PostContent = {
        text: 'Test with video',
        media: [{ type: 'video', url: 'https://example.com/video.mp4' }],
      }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.id).toBe('123')
      expect(mockBot.sendVideo).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.media![0].url,
        {
          caption: content.text,
        },
      )
    })

    test('should throw error when not initialized', async () => {
      adapter = new TelegramAdapter()
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

      expect(metrics.likes).toBe(0) // Telegram doesn't expose like counts
      expect(metrics.shares).toBe(0) // Telegram doesn't expose share counts
      expect(metrics.replies).toBe(0) // Telegram doesn't expose reply counts
      expect(metrics.reach).toBe(0) // Telegram doesn't expose view counts
    })

    test('should get follower count', async () => {
      const count = await adapter.getFollowerCount()
      expect(count).toBe(1000)
      expect(mockBot.getChatMemberCount).toHaveBeenCalledWith(
        mockConfig.channelId,
      )
    })
  })

  describe('message management', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should delete message', async () => {
      const success = await adapter.delete('123')
      expect(success).toBe(true)
      expect(mockBot.deleteMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        123,
      )
    })

    test('should reply to message', async () => {
      const content: PostContent = { text: 'Reply message' }
      const response = await adapter.reply('123', content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(mockBot.sendMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.text,
        {
          reply_to_message_id: 123,
        },
      )
    })
  })

  describe('platform features', () => {
    test('should return Telegram-specific features', () => {
      const features = adapter.getPlatformSpecificFeatures()

      expect(features.maxCharacters).toBe(4096)
      expect(features.canSchedule).toBe(false)
      expect(features.mediaTypes).toContain('image')
      expect(features.mediaTypes).toContain('video')
      expect(features.features).toContain('inline_keyboard')
      expect(features.features).toContain('message_threads')
    })
  })
})
