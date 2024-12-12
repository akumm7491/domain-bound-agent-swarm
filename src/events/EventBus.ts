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

type EventHandler = (event: Event) => Promise<void>

export class EventBus {
  private static instance: EventBus
  private handlers: Map<EventType, Set<EventHandler>>

  private constructor() {
    this.handlers = new Map()
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  async publish(event: Event): Promise<void> {
    const handlers = this.handlers.get(event.type) || new Set()

    // Execute all handlers concurrently but catch their errors
    const promises = Array.from(handlers).map(async handler => {
      try {
        await handler(event)
      } catch (error) {
        console.error(`Error in event handler for ${event.type}:`, error)
      }
    })

    try {
      // Wait for all handlers to complete
      await Promise.all(promises)
    } catch (error) {
      console.error(`Error in event handler for ${event.type}:`, error)
    }
  }

  subscribe(eventType: EventType, handler: EventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set())
    }
    this.handlers.get(eventType)!.add(handler)
  }

  unsubscribe(eventType: EventType, handler: EventHandler): void {
    const handlers = this.handlers.get(eventType)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.handlers.delete(eventType)
      }
    }
  }
}
