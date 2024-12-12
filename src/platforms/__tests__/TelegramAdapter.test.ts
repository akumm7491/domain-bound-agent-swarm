import { Telegraf } from 'telegraf'
import { Platform } from '../../domain/types'
import { TelegramAdapter, TelegramConfig } from '../TelegramAdapter'
import { PostContent } from '../PlatformAdapter'

// Mock telegraf
jest.mock('telegraf')

describe('TelegramAdapter', () => {
  let adapter: TelegramAdapter
  let mockConfig: TelegramConfig
  let mockTelegram: any

  beforeEach(() => {
    mockConfig = {
      botToken: 'test-token',
      channelId: '@testchannel',
    }

    mockTelegram = {
      getMe: jest.fn().mockResolvedValue({ id: 123, is_bot: true }),
      sendMessage: jest.fn().mockResolvedValue({
        message_id: 456,
        date: Math.floor(Date.now() / 1000),
        text: 'Test message',
      }),
      sendPhoto: jest.fn().mockResolvedValue({
        message_id: 457,
        date: Math.floor(Date.now() / 1000),
        photo: [{ file_id: 'photo123' }],
      }),
      sendVideo: jest.fn().mockResolvedValue({
        message_id: 458,
        date: Math.floor(Date.now() / 1000),
        video: { file_id: 'video123' },
      }),
      deleteMessage: jest.fn().mockResolvedValue(true),
      getChatMemberCount: jest.fn().mockResolvedValue(1000),
    }

    // Mock Telegraf constructor and methods
    ;(Telegraf as jest.Mock).mockImplementation(() => ({
      telegram: mockTelegram,
      launch: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    }))

    adapter = new TelegramAdapter()
  })

  describe('initialization', () => {
    test('should initialize with config', async () => {
      await adapter.initialize(mockConfig)
      expect(Telegraf).toHaveBeenCalledWith(mockConfig.botToken)
    })

    test('should verify authentication', async () => {
      await adapter.initialize(mockConfig)
      const isAuth = await adapter.isAuthenticated()
      expect(isAuth).toBe(true)
      expect(mockTelegram.getMe).toHaveBeenCalled()
    })

    test('should handle authentication failure', async () => {
      mockTelegram.getMe.mockRejectedValueOnce(new Error('Auth failed'))
      await adapter.initialize(mockConfig)
      const isAuth = await adapter.isAuthenticated()
      expect(isAuth).toBe(false)
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
      expect(response.id).toBe('456')
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.text,
        expect.any(Object),
      )
    })

    test('should post image content', async () => {
      const content: PostContent = {
        text: 'Test with image',
        media: [{ type: 'image', url: 'https://example.com/image.jpg' }],
      }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.id).toBe('457')
      expect(mockTelegram.sendPhoto).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.media[0].url,
        expect.any(Object),
      )
    })

    test('should post video content', async () => {
      const content: PostContent = {
        text: 'Test with video',
        media: [{ type: 'video', url: 'https://example.com/video.mp4' }],
      }
      const response = await adapter.post(content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.id).toBe('458')
      expect(mockTelegram.sendVideo).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.media[0].url,
        expect.any(Object),
      )
    })

    test('should throw error for unsupported media type', async () => {
      const content: PostContent = {
        text: 'Test with unsupported media',
        media: [{ type: 'link', url: 'https://example.com' }],
      }
      await expect(adapter.post(content)).rejects.toThrow(
        'Unsupported media type',
      )
    })
  })

  describe('engagement and metrics', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should get follower count', async () => {
      const count = await adapter.getFollowerCount()
      expect(count).toBe(1000)
      expect(mockTelegram.getChatMemberCount).toHaveBeenCalledWith(
        mockConfig.channelId,
      )
    })

    test('should handle missing channel ID for follower count', async () => {
      adapter = new TelegramAdapter()
      await adapter.initialize({ botToken: 'test-token' })
      const count = await adapter.getFollowerCount()
      expect(count).toBe(0)
    })

    test('should get platform features', () => {
      const features = adapter.getPlatformSpecificFeatures()
      expect(features.maxCharacters).toBe(4096)
      expect(features.canSchedule).toBe(false)
      expect(features.mediaTypes).toContain('image')
      expect(features.mediaTypes).toContain('video')
      expect(features.supportedFormats).toContain('HTML')
    })
  })

  describe('message management', () => {
    beforeEach(async () => {
      await adapter.initialize(mockConfig)
    })

    test('should delete message', async () => {
      const success = await adapter.delete('456')
      expect(success).toBe(true)
      expect(mockTelegram.deleteMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        456,
      )
    })

    test('should handle delete failure', async () => {
      mockTelegram.deleteMessage.mockRejectedValueOnce(new Error('Not found'))
      const success = await adapter.delete('456')
      expect(success).toBe(false)
    })

    test('should reply to message', async () => {
      const content: PostContent = { text: 'Reply message' }
      const response = await adapter.reply('456', content)

      expect(response.platform).toBe(Platform.TELEGRAM)
      expect(response.metadata.replyTo).toBe('456')
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        mockConfig.channelId,
        content.text,
        expect.objectContaining({
          reply_to_message_id: 456,
        }),
      )
    })
  })
})
