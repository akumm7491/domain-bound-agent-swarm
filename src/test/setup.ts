import '@jest/globals'

// Set test environment variables
process.env.NODE_ENV = 'test'

// Reset mocks between tests
beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})

// Global test setup
beforeAll(() => {
  // Add any global setup here
})

// Global test teardown
afterAll(() => {
  // Add any global teardown here
})
