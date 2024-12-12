import { OpenAI } from 'openai'
import { Platform } from '../../domain/types'
import {
  ContentGenerator,
  ContentTemplate,
  GenerationParams,
} from '../ContentGenerator'

// Mock OpenAI
jest.mock('openai')

describe('ContentGenerator', () => {
  let generator: ContentGenerator
  let mockOpenAI: jest.Mocked<OpenAI>
  let mockTemplate: ContentTemplate
  let mockCreate: jest.Mock

  beforeEach(() => {
    // Set up mock template
    mockTemplate = {
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

    // Set up mock OpenAI response
    const mockResponse = {
      choices: [
        {
          message: {
            content: JSON.stringify({
              content: {
                text: 'Generated test content',
              },
              variations: ['Variation 1', 'Variation 2'],
              metadata: {
                sentiment: 'positive',
                keywords: ['test', 'content'],
                performance: {
                  expectedEngagement: 80,
                  confidenceScore: 70,
                },
              },
            }),
          },
          index: 0,
          finish_reason: 'stop',
        },
      ],
      created: Date.now(),
      model: 'gpt-4',
      object: 'chat.completion',
      id: 'test-id',
    }

    // Set up mock create function
    mockCreate = jest.fn().mockResolvedValue(mockResponse)

    // Set up mock OpenAI client
    mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    } as unknown as jest.Mocked<OpenAI>

    // Mock OpenAI constructor
    ;(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
      () => mockOpenAI,
    )

    generator = new ContentGenerator({
      openai: {
        apiKey: 'test-api-key',
        model: 'gpt-4',
      },
      templates: [mockTemplate],
    })
  })

  describe('template management', () => {
    test('should get template by id', () => {
      const template = generator.getTemplate('news-update')
      expect(template).toEqual(mockTemplate)
    })

    test('should throw error for invalid template', () => {
      expect(() => generator.getTemplate('invalid')).toThrow(
        'Template invalid not found',
      )
    })
  })

  describe('content generation', () => {
    test('should generate content with template', async () => {
      const params: GenerationParams = {
        templateId: 'news-update',
        variables: { topic: 'AI technology' },
        platforms: [Platform.TWITTER],
      }

      const result = await generator.generateContent(params)

      expect(result.content.text).toBe('Generated test content')
      expect(result.variations).toHaveLength(2)
      expect(result.metadata.performance.expectedEngagement).toBe(80)
      expect(result.metadata.performance.confidenceScore).toBe(70)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('AI technology'),
            }),
          ]),
        }),
      )
    })

    test('should handle generation error', async () => {
      const mockError = new Error('Generation failed')
      mockCreate.mockRejectedValueOnce(mockError)

      const params: GenerationParams = {
        templateId: 'news-update',
        variables: { topic: 'AI technology' },
        platforms: [Platform.TWITTER],
      }

      await expect(generator.generateContent(params)).rejects.toThrow(
        'Generation failed',
      )
    })

    test('should handle invalid JSON response', async () => {
      const invalidResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON',
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        created: Date.now(),
        model: 'gpt-4',
        object: 'chat.completion',
        id: 'test-id',
      }

      mockCreate.mockResolvedValueOnce(invalidResponse)

      const params: GenerationParams = {
        templateId: 'news-update',
        variables: { topic: 'AI technology' },
        platforms: [Platform.TWITTER],
      }

      await expect(generator.generateContent(params)).rejects.toThrow(
        'Invalid response format',
      )
    })
  })

  describe('content validation', () => {
    test('should validate content length', async () => {
      const longContent = 'a'.repeat(300)
      const invalidResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: {
                  text: longContent,
                },
                variations: [],
                metadata: {
                  performance: {
                    expectedEngagement: 50,
                    confidenceScore: 50,
                  },
                },
              }),
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        created: Date.now(),
        model: 'gpt-4',
        object: 'chat.completion',
        id: 'test-id',
      }

      mockCreate.mockResolvedValueOnce(invalidResponse)

      const params: GenerationParams = {
        templateId: 'news-update',
        variables: { topic: 'AI technology' },
        platforms: [Platform.TWITTER],
      }

      await expect(generator.generateContent(params)).rejects.toThrow(
        'Content exceeds maximum length',
      )
    })

    test('should validate required metadata', async () => {
      const invalidResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                content: {
                  text: 'Test content',
                },
                variations: [],
              }),
            },
            index: 0,
            finish_reason: 'stop',
          },
        ],
        created: Date.now(),
        model: 'gpt-4',
        object: 'chat.completion',
        id: 'test-id',
      }

      mockCreate.mockResolvedValueOnce(invalidResponse)

      const params: GenerationParams = {
        templateId: 'news-update',
        variables: { topic: 'AI technology' },
        platforms: [Platform.TWITTER],
      }

      await expect(generator.generateContent(params)).rejects.toThrow(
        'Missing required metadata',
      )
    })
  })
})
