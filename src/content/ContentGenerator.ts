import { Platform } from '../domain/types'
import { PostContent } from '../platforms/PlatformAdapter'
import OpenAI from 'openai'
import winston from 'winston'

export interface ContentTemplate {
  id: string
  name: string
  description: string
  prompt: string
  variables: string[]
  platforms: Platform[]
  format: {
    maxLength?: number
    requiresMedia?: boolean
    style?: string
  }
}

export interface ContentContext {
  recentPosts?: PostContent[]
  trending?: string[]
  timeOfDay?: string
  audience?: {
    demographics?: Record<string, number>
    interests?: string[]
    behavior?: Record<string, number>
  }
}

export interface ContentRequest {
  domain: string
  template: ContentTemplate
  variables: Record<string, string>
  platforms: Platform[]
  tone?: string
  context?: ContentContext
  affiliatePromotion?: {
    enabled: boolean
    type?: 'PREMIUM' | 'FRAGMENT'
    customMessage?: string
  }
}

export interface GenerationMetadata {
  template: string
  generationParams: {
    model: string
    temperature: number
    domain: string
    platforms: Platform[]
  }
  performance?: {
    expectedEngagement: number
    confidenceScore: number
  }
}

export interface ContentResponse {
  content: PostContent
  variations: PostContent[]
  metadata: GenerationMetadata
}

export class ContentGenerator {
  private openai: OpenAI
  private logger: winston.Logger
  private templates: Map<string, ContentTemplate> = new Map()

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey })

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({
          format: winston.format.simple(),
        }),
      ],
    })

    this.initializeTemplates()
  }

  async generateContent(request: ContentRequest): Promise<ContentResponse> {
    const template = this.templates.get(request.template.id)
    if (!template) {
      throw new Error(`Template ${request.template.id} not found`)
    }

    try {
      // Generate base content
      const content = await this.generateBaseContent(request)

      // Generate platform-specific variations
      const variations = await this.generateVariations(
        content,
        request.platforms,
      )

      // Analyze expected performance
      const performance = await this.analyzePerformance(content, request)

      return {
        content,
        variations,
        metadata: {
          template: template.id,
          generationParams: {
            model: 'gpt-4',
            temperature: 0.7,
            domain: request.domain,
            platforms: request.platforms,
          },
          performance,
        },
      }
    } catch (error) {
      this.logger.error('Content generation failed:', error)
      throw error
    }
  }

  registerTemplate(template: ContentTemplate): void {
    this.templates.set(template.id, template)
  }

  getTemplate(id: string): ContentTemplate | undefined {
    return this.templates.get(id)
  }

  private async generateBaseContent(
    request: ContentRequest,
  ): Promise<PostContent> {
    const prompt = this.buildPrompt(request)

    const systemPrompt = `You are an expert social media content creator specializing in ${
      request.domain
    }. Create engaging, informative content that matches the specified tone and format.${
      request.affiliatePromotion?.enabled
        ? '\nIncorporate a natural, non-pushy promotion for ' +
          (request.affiliatePromotion.type === 'PREMIUM'
            ? 'Telegram Premium benefits'
            : 'Telegram Fragment usernames') +
          ' when relevant.'
        : ''
    }`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 500,
    })

    const content = completion.choices[0]?.message?.content
    if (!content) throw new Error('No content generated')

    return {
      text: content,
      metadata: {
        domain: request.domain,
        template: request.template.id,
        generated: new Date(),
        affiliatePromotion: request.affiliatePromotion,
      },
    }
  }

  private async generateVariations(
    baseContent: PostContent,
    platforms: Platform[],
  ): Promise<PostContent[]> {
    return Promise.all(
      platforms.map(async platform => {
        const prompt = `Adapt the following content for ${platform}, 
                       maintaining the same message but optimizing for the platform's format and style:
                       "${baseContent.text}"`

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: `You are an expert in creating content for ${platform}.
                       Adapt the content while maintaining its core message and tone.`,
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
        })

        const content = completion.choices[0]?.message?.content
        if (!content) throw new Error('No variation generated')

        return {
          text: content,
          metadata: {
            ...baseContent.metadata,
            platform,
            originalContent: baseContent.text,
          },
        }
      }),
    )
  }

  private async analyzePerformance(
    content: PostContent,
    request: ContentRequest,
  ): Promise<{
    expectedEngagement: number
    confidenceScore: number
  }> {
    const prompt = `Analyze the following social media content and predict its engagement potential:
                   Content: "${content.text}"
                   Domain: ${request.domain}
                   Platforms: ${request.platforms.join(', ')}
                   
                   Provide two numbers:
                   1. Expected engagement score (0-100)
                   2. Confidence score (0-100)`

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are an expert in social media analytics and engagement prediction.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
    })

    const analysis = completion.choices[0]?.message?.content
    if (!analysis) throw new Error('No analysis generated')

    // Parse scores from the response
    const scores = analysis.match(/\d+/g)?.map(Number) || [0, 0]

    return {
      expectedEngagement: scores[0] || 0,
      confidenceScore: scores[1] || 0,
    }
  }

  private buildPrompt(request: ContentRequest): string {
    const template = this.templates.get(request.template.id)
    if (!template) {
      throw new Error(`Template ${request.template.id} not found`)
    }

    const promptParts: string[] = [template.prompt]

    // Replace variables
    let processedPrompt = template.prompt
    for (const [key, value] of Object.entries(request.variables)) {
      processedPrompt = processedPrompt.replace(`{${key}}`, value)
    }
    promptParts[0] = processedPrompt

    // Add affiliate promotion context if enabled
    if (request.affiliatePromotion?.enabled) {
      promptParts.push('\nPromotion Guidelines:')
      if (request.affiliatePromotion.type === 'PREMIUM') {
        promptParts.push(
          '- Naturally mention Telegram Premium benefits when relevant',
          '- Focus on features like increased upload limits, exclusive stickers, and ad-free experience',
          '- Use a subtle, value-focused approach',
        )
      } else {
        promptParts.push(
          '- Mention Fragment username benefits when appropriate',
          '- Highlight the value of having a unique, memorable username',
          '- Keep the promotion natural and contextual',
        )
      }
      if (request.affiliatePromotion.customMessage) {
        promptParts.push(
          `Custom promotion message: ${request.affiliatePromotion.customMessage}`,
        )
      }
    }

    // Add other context
    if (request.context) {
      promptParts.push('\nContext:')

      if (request.context.recentPosts?.length) {
        promptParts.push(
          'Recent posts:\n' +
            request.context.recentPosts.map(p => `- ${p.text}`).join('\n'),
        )
      }

      if (request.context.trending?.length) {
        promptParts.push(
          'Trending topics: ' + request.context.trending.join(', '),
        )
      }

      if (request.context.timeOfDay) {
        promptParts.push('Time of day: ' + request.context.timeOfDay)
      }

      if (request.context.audience) {
        promptParts.push('Audience:')
        if (request.context.audience.demographics) {
          promptParts.push(
            'Demographics: ' +
              Object.entries(request.context.audience.demographics)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', '),
          )
        }
        if (request.context.audience.interests?.length) {
          promptParts.push(
            'Interests: ' + request.context.audience.interests.join(', '),
          )
        }
      }
    }

    return promptParts.join('\n')
  }

  private initializeTemplates(): void {
    // Register default templates
    this.registerTemplate({
      id: 'news-update',
      name: 'News Update',
      description: 'Share latest news or updates in your domain',
      prompt:
        'Create a news update about {topic} for {platform}. Include key points and maintain a {tone} tone.',
      variables: ['topic', 'platform', 'tone'],
      platforms: [Platform.TWITTER, Platform.TELEGRAM, Platform.DISCORD],
      format: {
        maxLength: 280,
        requiresMedia: false,
        style: 'informative',
      },
    })

    this.registerTemplate({
      id: 'insight-share',
      name: 'Expert Insight',
      description: 'Share expert insights or analysis',
      prompt:
        'Share an expert insight about {topic} that demonstrates deep knowledge while maintaining accessibility.',
      variables: ['topic'],
      platforms: [Platform.TWITTER, Platform.TELEGRAM, Platform.DISCORD],
      format: {
        maxLength: 560,
        requiresMedia: false,
        style: 'analytical',
      },
    })

    this.registerTemplate({
      id: 'trend-analysis',
      name: 'Trend Analysis',
      description: 'Analyze and explain current trends',
      prompt:
        'Analyze the current trend in {topic}, explaining its significance and potential impact.',
      variables: ['topic'],
      platforms: [Platform.TWITTER, Platform.TELEGRAM, Platform.DISCORD],
      format: {
        maxLength: 800,
        requiresMedia: true,
        style: 'analytical',
      },
    })
  }
}
