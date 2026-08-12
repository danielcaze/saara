import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/unit/metadata/extractMetadata.test.ts'],
    testTimeout: 15000,
  },
})
