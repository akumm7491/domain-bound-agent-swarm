import express from 'express'
import { AgentRuntime, AgentRuntimeConfig } from './agents/AgentRuntime'
import { AgentFactory } from './agents/AgentFactory'
import { Platform } from './domain/types'
import { TwitterAdapter } from './platforms/TwitterAdapter'
import { TelegramAdapter } from './platforms/TelegramAdapter'
import { DiscordAdapter } from './platforms/DiscordAdapter'
import winston from 'winston'
import promClient from 'prom-client'

// Initialize Prometheus metrics
const register = new promClient.Registry()
promClient.collectDefaultMetrics({ register })

// Custom metrics
const contentGenerationCounter = new promClient.Counter({
  name: 'content_generation_total',
  help: 'Total number of content pieces generated',
  labelNames: ['platform', 'domain'] as const,
})

const postLatencyHistogram = new promClient.Histogram({
  name: 'post_latency_seconds',
  help: 'Latency of post operations',
  labelNames: ['platform'] as const,
  buckets: [0.1, 0.5, 1, 2, 5],
})

const activeAgentsGauge = new promClient.Gauge({
  name: 'active_agents_total',
  help: 'Total number of active agents',
  labelNames: ['domain'] as const,
})

register.registerMetric(contentGenerationCounter)
register.registerMetric(postLatencyHistogram)
register.registerMetric(activeAgentsGauge)

const app = express()
const port = process.env.PORT || 3000

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
  ],
})

// Environment validation
function validateEnv(): void {
  const required = ['REDIS_URL', 'NODE_ENV', 'OPENAI_API_KEY']

  const missing = required.filter(key => !process.env[key])
  if (missing.length > 0) {
    logger.warn(`Missing environment variables: ${missing.join(', ')}`)
  }
}

// Create a global runtime variable that will be set during initialization
let globalRuntime: AgentRuntime | undefined

// Initialize runtime with validated config
async function initializeRuntime(): Promise<AgentRuntime> {
  validateEnv()

  const config: AgentRuntimeConfig = {
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    },
    contentGeneration: {
      interval: parseInt(process.env.CONTENT_GENERATION_INTERVAL || '3600000'),
      maxPostsPerDay: parseInt(process.env.MAX_POSTS_PER_DAY || '24'),
    },
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
    },
  }

  const agentFactory = new AgentFactory()
  const runtime = new AgentRuntime(config, agentFactory)
  await runtime.start() // Start the runtime
  globalRuntime = runtime
  return runtime
}

// Initialize platform adapters
async function initializePlatforms(runtime: AgentRuntime): Promise<void> {
  try {
    if (process.env.DISABLE_PLATFORM_INIT === 'true') {
      logger.info('Platform initialization disabled by configuration')
      return
    }

    const initializationResults: Record<Platform, boolean> = {
      [Platform.TWITTER]: false,
      [Platform.TELEGRAM]: false,
      [Platform.DISCORD]: false,
    }

    // Twitter
    if (process.env.DISABLE_TWITTER !== 'true') {
      try {
        const twitterAdapter = new TwitterAdapter()
        await twitterAdapter.initialize({
          apiKey: process.env.TWITTER_API_KEY || '',
          apiSecret: process.env.TWITTER_API_SECRET || '',
          accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
          accessTokenSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET || '',
        })
        runtime.registerPlatform(Platform.TWITTER, twitterAdapter)
        initializationResults[Platform.TWITTER] = true
        logger.info('Twitter platform initialized successfully')
      } catch (error) {
        logger.error('Failed to initialize Twitter platform:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      logger.info('Twitter platform initialization disabled')
    }

    // Telegram
    if (process.env.DISABLE_TELEGRAM !== 'true') {
      try {
        const telegramAdapter = new TelegramAdapter()
        await telegramAdapter.initialize({
          botToken: process.env.TELEGRAM_BOT_TOKEN || '',
        })
        runtime.registerPlatform(Platform.TELEGRAM, telegramAdapter)
        initializationResults[Platform.TELEGRAM] = true
        logger.info('Telegram platform initialized successfully')
      } catch (error) {
        logger.error('Failed to initialize Telegram platform:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      logger.info('Telegram platform initialization disabled')
    }

    // Discord
    if (process.env.DISABLE_DISCORD !== 'true') {
      try {
        const discordAdapter = new DiscordAdapter()
        await discordAdapter.initialize({
          botToken: process.env.DISCORD_BOT_TOKEN || '',
          clientId: process.env.DISCORD_CLIENT_ID || '',
          channelId: process.env.DISCORD_CHANNEL_ID || '',
        })
        runtime.registerPlatform(Platform.DISCORD, discordAdapter)
        initializationResults[Platform.DISCORD] = true
        logger.info('Discord platform initialized successfully')
      } catch (error) {
        logger.error('Failed to initialize Discord platform:', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      logger.info('Discord platform initialization disabled')
    }

    logger.info('Platform initialization completed', {
      results: initializationResults,
    })
  } catch (error) {
    logger.error('Unexpected error during platform initialization:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

// Start server with graceful shutdown
async function startServer(runtime: AgentRuntime): Promise<void> {
  let server: ReturnType<typeof app.listen>

  try {
    await initializePlatforms(runtime)

    // Metrics endpoint
    app.get('/metrics', async (_req, res) => {
      try {
        res.set('Content-Type', register.contentType)
        res.end(await register.metrics())
      } catch (error) {
        logger.error('Failed to generate metrics:', error)
        res.status(500).send('Failed to generate metrics')
      }
    })

    // Enhanced health check endpoint
    app.get('/health', (_req, res) => {
      const uptime = process.uptime()
      const memoryUsage = process.memoryUsage()

      res.status(200).json({
        status: 'healthy',
        uptime,
        memory: {
          heapUsed: memoryUsage.heapUsed,
          heapTotal: memoryUsage.heapTotal,
          rss: memoryUsage.rss,
        },
        timestamp: new Date().toISOString(),
      })
    })

    // Enhanced readiness check endpoint
    app.get('/health/ready', async (_req, res) => {
      try {
        const platforms = [
          Platform.TWITTER,
          Platform.TELEGRAM,
          Platform.DISCORD,
        ]
        const status = {
          redis: false,
          platforms: {} as Record<Platform, boolean>,
          metrics: true,
        }

        // Check Redis connection by checking if runtime is initialized
        status.redis = globalRuntime !== undefined

        // Check platform connections
        const platformsDisabled = process.env.DISABLE_PLATFORM_INIT === 'true'
        if (platformsDisabled) {
          // If platforms are disabled, mark them as "ready"
          for (const platform of platforms) {
            status.platforms[platform] = true
          }
        } else {
          // Check each platform's status
          for (const platform of platforms) {
            if (globalRuntime) {
              const adapter = globalRuntime.getPlatformAdapter(platform)
              if (adapter) {
                try {
                  status.platforms[platform] = await adapter.isAuthenticated()
                } catch (error) {
                  logger.error(`Platform ${platform} health check failed:`, {
                    error:
                      error instanceof Error ? error.message : String(error),
                  })
                  status.platforms[platform] = false
                }
              } else {
                status.platforms[platform] = false
              }
            } else {
              status.platforms[platform] = false
            }
          }
        }

        // Check metrics system
        try {
          await register.metrics()
        } catch (error) {
          logger.error('Metrics system check failed:', {
            error: error instanceof Error ? error.message : String(error),
          })
          status.metrics = false
        }

        const isReady =
          status.redis &&
          (platformsDisabled || Object.values(status.platforms).some(v => v)) && // Consider ready if platforms are disabled
          status.metrics

        const response = {
          status: isReady ? 'ready' : 'not ready',
          checks: status,
          timestamp: new Date().toISOString(),
        }

        res.status(isReady ? 200 : 503).json(response)
      } catch (error) {
        logger.error('Readiness check failed:', {
          error: error instanceof Error ? error.message : String(error),
        })
        res.status(500).json({
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        })
      }
    })

    // Start the server
    server = app.listen(port, () => {
      logger.info(`Server is running on port ${port}`, {
        nodeEnv: process.env.NODE_ENV,
        metricsEnabled: true,
      })
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`)

      // Close server first (stop accepting new connections)
      server.close(() => {
        logger.info('HTTP server closed')
      })

      try {
        // Stop the runtime (includes Redis connections)
        await runtime.stop()
        logger.info('Runtime stopped successfully')

        // Final cleanup
        logger.info('Cleanup completed, exiting process')
        process.exit(0)
      } catch (error) {
        logger.error('Error during shutdown:', {
          error: error instanceof Error ? error.message : String(error),
        })
        process.exit(1)
      }
    }

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error('Failed to start server:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Bootstrap application
async function bootstrap(): Promise<void> {
  try {
    const runtime = await initializeRuntime()
    await startServer(runtime)
  } catch (error) {
    logger.error('Failed to bootstrap application:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    process.exit(1)
  }
}

// Start the application
bootstrap()
