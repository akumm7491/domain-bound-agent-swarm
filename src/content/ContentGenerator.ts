import { OpenAI } from 'openai'
import { Platform } from '../domain/types'

export interface ContentTemplate {
  id: string
  name: string
  description: string
  prompt: string
  variables: string[]
  platforms: Platform[]
  format: {
    maxLength: number
  }
}

export interface GenerationParams {
  templateId: string
  variables: Record<string, string>
  platforms: Platform[]
}

export interface ContentGeneratorConfig {
  openai: {
    apiKey: string
    model: string
  }
  templates: ContentTemplate[]
}

export interface GeneratedContent {
  content: {
    text: string
    metadata?: Record<string, any>
  }
  variations: string[]
  metadata: {
    template: string
    generationParams: Record<string, any>
    performance: {
      expectedEngagement: number
      confidenceScore: number
    }
  }
}

interface OpenAIResponse {
  content: {
    text: string
    metadata?: Record<string, any>
  }
  variations: string[]
  metadata: {
    performance: {
      expectedEngagement: number
      confidenceScore: number
    }
  }
}

export class ContentGenerator {
  private openai: OpenAI
  private templates: Map<string, ContentTemplate>

  constructor(config: ContentGeneratorConfig) {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    })
    this.templates = new Map(config.templates.map(t => [t.id, t]))
  }

  getTemplate(id: string): ContentTemplate {
    const template = this.templates.get(id)
    if (!template) {
      throw new Error(`Template ${id} not found`)
    }
    return template
  }

  async generateContent(params: GenerationParams): Promise<GeneratedContent> {
    const template = this.getTemplate(params.templateId)

    // Generate content using OpenAI
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `You are a content generation assistant. Generate content based on the following template: ${template.prompt}`,
        },
        {
          role: 'user',
          content: JSON.stringify(params.variables),
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content generated')
    }

    try {
      const result = JSON.parse(content) as OpenAIResponse

      // Validate content length
      if (result.content.text.length > template.format.maxLength) {
        throw new Error('Content exceeds maximum length')
      }

      // Validate required metadata
      if (!result.metadata?.performance) {
        throw new Error('Missing required metadata')
      }

      return {
        content: result.content,
        variations: result.variations || [],
        metadata: {
          template: template.id,
          generationParams: params.variables,
          performance: result.metadata.performance,
        },
      }
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid response format')
      }
      throw error
    }
  }
}
