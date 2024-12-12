import { Platform } from '../domain/types'

export interface PostContent {
  text: string
  media?: {
    type: 'image' | 'video' | 'link'
    url: string
  }[]
  metadata?: Record<string, any>
}

export interface PostResponse {
  id: string
  platform: Platform
  url?: string
  timestamp: Date
  metadata?: Record<string, any>
}

export interface EngagementMetrics {
  likes: number
  shares: number
  replies: number
  reach: number
  platformSpecific?: Record<string, any>
}

export interface PlatformAdapter {
  platform: Platform

  // Authentication
  initialize(config: Record<string, any>): Promise<void>
  isAuthenticated(): Promise<boolean>

  // Content Management
  post(content: PostContent): Promise<PostResponse>
  schedule(content: PostContent, publishAt: Date): Promise<PostResponse>
  delete(postId: string): Promise<boolean>

  // Engagement
  getEngagement(postId: string): Promise<EngagementMetrics>
  reply(postId: string, content: PostContent): Promise<PostResponse>

  // Analytics
  getFollowerCount(): Promise<number>
  getReachMetrics(postId: string): Promise<number>

  // Platform-specific
  getPlatformSpecificFeatures(): Record<string, any>
}
