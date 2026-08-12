import type { SaaraAPI } from '../../preload'

declare global {
  interface Window {
    saaraAPI: SaaraAPI
  }
}

export {}
