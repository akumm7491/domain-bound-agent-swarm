import OpenAI from 'openai'
import { Platform } from '../../domain/types'
import {
  ContentGenerator,
  ContentTemplate,
  ContentRequest,
} from '../ContentGenerator'

// Mock OpenAI
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: 'Generated content for testing',
              },
            },
          ],
        }),
      },
    },
  }))
})

describe('ContentGenerator', () => {
  let generator: ContentGenerator
  let mockTemplate: ContentTemplate
  let mockRequest: ContentRequest

  beforeEach(() => {
    generator = new ContentGenerator('test-api-key')

    mockTemplate = {
      id: 'test-template',
      name: 'Test Template',
      description: 'Template for testing',
      prompt: 'Generate content about {topic} for {platform}',
      variables: ['topic', 'platform'],
      platforms: [Platform.TWITTER],
      format: {
        maxLength: 280,
        requiresMedia: false,
        style: 'test',
      },
    }

    mockRequest = {
      domain: 'test-domain',
      template: mockTemplate,
      variables: {
        topic: 'test topic',
        platform: 'Twitter',
      },
      platforms: [Platform.TWITTER],
    }

    generator.registerTemplate(mockTemplate)
  })

  describe('template management', () => {
    test('should register and retrieve template', () => {
      const template = generator.getTemplate('test-template')
      expect(template).toEqual(mockTemplate)
    })

    test('should have default templates', () => {
      expect(generator.getTemplate('news-update')).toBeDefined()
      expect(generator.getTemplate('insight-share')).toBeDefined()
      expect(generator.getTemplate('trend-analysis')).toBeDefined()
    })
  })

  describe('content generation', () => {
    test('should generate content with variations', async () => {
      const response = await generator.generateContent(mockRequest)

      expect(response.content).toBeDefined()
      expect(response.content.text).toBe('Generated content for testing')
      expect(response.variations).toHaveLength(1)
      expect(response.metadata.template).toBe('test-template')
      expect(response.metadata.performance).toBeDefined()
    })

    test('should include context in generation', async () => {
      const requestWithContext = {
        ...mockRequest,
        context: {
          recentPosts: [{ text: 'Previous post' }],
          trending: ['trend1', 'trend2'],
          timeOfDay: 'morning',
        },
      }

      const response = await generator.generateContent(requestWithContext)
      expect(response.content).toBeDefined()
      expect(response.metadata.generationParams.domain).toBe('test-domain')
    })

    test('should throw error for invalid template', async () => {
      const invalidRequest = {
        ...mockRequest,
        template: { ...mockTemplate, id: 'invalid-template' },
      }

      await expect(generator.generateContent(invalidRequest)).rejects.toThrow(
        'Template invalid-template not found',
      )
    })
  })

  describe('performance analysis', () => {
    test('should include performance metrics', async () => {
      // Mock the OpenAI response for performance analysis
      const mockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>
      const mockCreate = jest
        .fn()
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'Generated content',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'Platform variation',
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: 'Expected engagement: 85\nConfidence score: 75',
              },
            },
          ],
        })

      mockOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      )

      const response = await generator.generateContent(mockRequest)
      expect(response.metadata.performance?.expectedEngagement).toBeDefined()
      expect(response.metadata.performance?.confidenceScore).toBeDefined()
    })
  })

  describe('error handling', () => {
    test('should handle OpenAI API errors', async () => {
      const mockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>
      const mockCreate = jest.fn().mockRejectedValueOnce(new Error('API Error'))

      mockOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      )

      await expect(generator.generateContent(mockRequest)).rejects.toThrow(
        'API Error',
      )
    })

    test('should handle empty responses', async () => {
      const mockOpenAI = OpenAI as jest.MockedClass<typeof OpenAI>
      const mockCreate = jest.fn().mockResolvedValueOnce({
        choices: [{ message: { content: null } }],
      })

      mockOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      )

      await expect(generator.generateContent(mockRequest)).rejects.toThrow(
        'No content generated',
      )
    })
  })
})
