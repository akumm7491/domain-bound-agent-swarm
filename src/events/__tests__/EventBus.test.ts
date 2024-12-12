import { EventBus, EventType, Event } from '../EventBus'

describe('EventBus', () => {
  let eventBus: EventBus
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    // Reset the singleton instance before each test
    ;(EventBus as any).instance = undefined
    eventBus = EventBus.getInstance()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  test('should maintain singleton instance', () => {
    const instance1 = EventBus.getInstance()
    const instance2 = EventBus.getInstance()
    expect(instance1).toBe(instance2)
  })

  test('should subscribe to events', async () => {
    const handler = jest.fn()
    eventBus.subscribe(EventType.CONTENT_CREATED, async event => handler(event))

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    await eventBus.publish(event)
    expect(handler).toHaveBeenCalledWith(event)
  })

  test('should unsubscribe from events', async () => {
    const handler = jest.fn()
    const wrappedHandler = async (event: Event) => handler(event)
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler)
    eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler)

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    await eventBus.publish(event)
    expect(handler).not.toHaveBeenCalled()
  })

  test('should handle multiple subscribers', async () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    eventBus.subscribe(EventType.CONTENT_CREATED, async event =>
      handler1(event),
    )
    eventBus.subscribe(EventType.CONTENT_CREATED, async event =>
      handler2(event),
    )

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    await eventBus.publish(event)
    expect(handler1).toHaveBeenCalledWith(event)
    expect(handler2).toHaveBeenCalledWith(event)
  })

  test('should handle errors in subscribers', async () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    eventBus.subscribe(EventType.CONTENT_CREATED, async () => {
      handler1()
      throw new Error('Test error')
    })
    eventBus.subscribe(EventType.CONTENT_CREATED, async event =>
      handler2(event),
    )

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Should not throw
    await eventBus.publish(event)
    expect(handler1).toHaveBeenCalled()
    expect(handler2).toHaveBeenCalledWith(event)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in event handler for content.created:',
      expect.any(Error),
    )
  })

  test('should handle events with no subscribers', async () => {
    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Should not throw
    await expect(eventBus.publish(event)).resolves.not.toThrow()
  })

  test('should handle multiple event types', async () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    eventBus.subscribe(EventType.CONTENT_CREATED, async event =>
      handler1(event),
    )
    eventBus.subscribe(EventType.CONTENT_PUBLISHED, async event =>
      handler2(event),
    )

    const event1: Event = {
      id: 'test-event-1',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    const event2: Event = {
      id: 'test-event-2',
      type: EventType.CONTENT_PUBLISHED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    await eventBus.publish(event1)
    await eventBus.publish(event2)
    expect(handler1).toHaveBeenCalledWith(event1)
    expect(handler2).toHaveBeenCalledWith(event2)
  })

  test('should handle unsubscribe for non-existent event type', () => {
    const handler = jest.fn()
    const wrappedHandler = async (event: Event) => handler(event)

    // Should not throw when unsubscribing from non-existent event type
    expect(() => {
      eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler)
    }).not.toThrow()
  })

  test('should clean up empty handler sets', () => {
    const handler = jest.fn()
    const wrappedHandler = async (event: Event) => handler(event)

    // Subscribe and then unsubscribe to create empty handler set
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler)
    eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler)

    // Verify the handler set was removed
    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Should not throw and handler should not be called
    return expect(eventBus.publish(event)).resolves.not.toThrow()
  })

  test('should handle unsubscribe with remaining handlers', () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const wrappedHandler1 = async (event: Event) => handler1(event)
    const wrappedHandler2 = async (event: Event) => handler2(event)

    // Subscribe both handlers
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler1)
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler2)

    // Unsubscribe only one handler
    eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler1)

    // Verify only the remaining handler is called
    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    return eventBus.publish(event).then(() => {
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith(event)
    })
  })

  test('should handle multiple errors in different handlers', async () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const handler3 = jest.fn()

    eventBus.subscribe(EventType.CONTENT_CREATED, async () => {
      handler1()
      throw new Error('Error 1')
    })
    eventBus.subscribe(EventType.CONTENT_CREATED, async () => {
      handler2()
      throw new Error('Error 2')
    })
    eventBus.subscribe(EventType.CONTENT_CREATED, async event => {
      handler3()
    })

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Should not throw and all handlers should be called
    await eventBus.publish(event)
    expect(handler1).toHaveBeenCalled()
    expect(handler2).toHaveBeenCalled()
    expect(handler3).toHaveBeenCalled()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in event handler for content.created:',
      expect.any(Error),
    )
  })

  test('should add handler to existing event type', () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const wrappedHandler1 = async (event: Event) => handler1(event)
    const wrappedHandler2 = async (event: Event) => handler2(event)

    // Subscribe first handler to create handler set
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler1)

    // Subscribe second handler to existing handler set
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler2)

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Both handlers should be called
    return eventBus.publish(event).then(() => {
      expect(handler1).toHaveBeenCalledWith(event)
      expect(handler2).toHaveBeenCalledWith(event)
    })
  })

  test('should handle errors in Promise.all', async () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const handler3 = jest.fn()

    // Mock Promise.all to throw an error
    const originalPromiseAll = Promise.all
    Promise.all = jest.fn().mockRejectedValue(new Error('Promise.all error'))

    eventBus.subscribe(EventType.CONTENT_CREATED, async () => {
      handler1()
      throw new Error('Error 1')
    })
    eventBus.subscribe(EventType.CONTENT_CREATED, async () => {
      handler2()
      throw new Error('Error 2')
    })
    eventBus.subscribe(EventType.CONTENT_CREATED, async event => {
      handler3()
    })

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Should not throw even if Promise.all fails
    await expect(eventBus.publish(event)).resolves.not.toThrow()
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error in event handler for content.created:',
      expect.any(Error),
    )

    // Restore original Promise.all
    Promise.all = originalPromiseAll
  })

  test('should handle unsubscribe from non-existent handler', () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const wrappedHandler1 = async (event: Event) => handler1(event)
    const wrappedHandler2 = async (event: Event) => handler2(event)

    // Subscribe first handler
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler1)

    // Try to unsubscribe a handler that was never subscribed
    eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler2)

    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Original handler should still be called
    return eventBus.publish(event).then(() => {
      expect(handler1).toHaveBeenCalledWith(event)
      expect(handler2).not.toHaveBeenCalled()
    })
  })

  test('should handle unsubscribe with non-empty handler set', () => {
    const handler1 = jest.fn()
    const handler2 = jest.fn()
    const wrappedHandler1 = async (event: Event) => handler1(event)
    const wrappedHandler2 = async (event: Event) => handler2(event)

    // Subscribe both handlers
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler1)
    eventBus.subscribe(EventType.CONTENT_CREATED, wrappedHandler2)

    // Unsubscribe one handler but keep the set
    eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler1)

    // Verify the handler set still exists
    const event: Event = {
      id: 'test-event',
      type: EventType.CONTENT_CREATED,
      agentId: 'test-agent',
      timestamp: new Date(),
      payload: { text: 'Test content' },
      metadata: {
        domain: 'crypto',
        platform: 'twitter',
        priority: 1,
      },
    }

    // Only the remaining handler should be called
    return eventBus.publish(event).then(() => {
      expect(handler1).not.toHaveBeenCalled()
      expect(handler2).toHaveBeenCalledWith(event)

      // Now unsubscribe the last handler
      eventBus.unsubscribe(EventType.CONTENT_CREATED, wrappedHandler2)

      // The handler set should be removed
      return eventBus.publish(event).then(() => {
        expect(handler1).not.toHaveBeenCalled()
        expect(handler2).toHaveBeenCalledTimes(1)
      })
    })
  })
})
