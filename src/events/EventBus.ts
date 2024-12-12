import { EventEmitter } from 'events'

export enum EventType {
  CONTENT_CREATED = 'content.created',
  CONTENT_SCHEDULED = 'content.scheduled',
  CONTENT_PUBLISHED = 'content.published',
  ENGAGEMENT_RECEIVED = 'engagement.received',
  TREND_DETECTED = 'trend.detected',
  STRATEGY_UPDATED = 'strategy.updated',
  ANALYTICS_UPDATED = 'analytics.updated',
}

export interface Event {
  id: string
  type: EventType
  agentId: string
  timestamp: Date
  payload: any
  metadata: {
    domain: string
    platform: string
    priority: number
  }
}

export class EventBus {
  private emitter: EventEmitter
  private static instance: EventBus

  private constructor() {
    this.emitter = new EventEmitter()
    this.emitter.setMaxListeners(100) // Adjust based on needs
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  async publish(event: Event): Promise<void> {
    this.emitter.emit(event.type, event)
  }

  subscribe(
    eventType: EventType,
    handler: (event: Event) => Promise<void>,
  ): void {
    this.emitter.on(eventType, handler)
  }

  unsubscribe(
    eventType: EventType,
    handler: (event: Event) => Promise<void>,
  ): void {
    this.emitter.off(eventType, handler)
  }
}
