import { useEffect, useState } from 'react'

import type { MediaType } from '../../../shared/types'

export interface LightboxPreviewResult {
  dataUrl: string | null
  failed: boolean
}

interface CacheEntry extends LightboxPreviewResult {
  promise: Promise<LightboxPreviewResult>
}

// Module-scoped so it survives across Lightbox open/close and outlives any
// single component instance — a photo prefetched while browsing stays cached
// even if the Lightbox unmounts and reopens on it later.
const cache = new Map<string, CacheEntry>()

function fetchPreview(path: string, mediaType: MediaType): Promise<LightboxPreviewResult> {
  const existing = cache.get(path)
  if (existing) return existing.promise

  const promise = window.saaraAPI.getLightboxPreview(path, mediaType).then((res) => {
    const result: LightboxPreviewResult = res
      ? { dataUrl: res.dataUrl, failed: false }
      : { dataUrl: null, failed: true }
    const entry = cache.get(path)
    if (entry) Object.assign(entry, result)
    return result
  })

  cache.set(path, { dataUrl: null, failed: false, promise })
  return promise
}

// Fire-and-forget: warms the cache for a neighboring photo so navigating to
// it later reads an already-resolved cache entry instead of showing the
// loading placeholder.
export function prefetchLightboxPreview(path: string, mediaType: MediaType): void {
  if (mediaType === 'video') return
  void fetchPreview(path, mediaType)
}

// Separate from useThumbnailDataUrl: the Lightbox needs a much larger image
// than the grid thumbnail, backed by a different IPC channel
// (getLightboxPreview vs. getThumbnail) that prefers EXIF PreviewImage over
// ThumbnailImage. Reads straight from the shared cache on every render, so a
// prefetched or previously-viewed photo renders instantly with no flash.
export function useLightboxPreview(
  path: string | null,
  mediaType: MediaType
): LightboxPreviewResult {
  const [, forceRender] = useState(0)

  useEffect(() => {
    if (!path || mediaType === 'video') return

    let cancelled = false
    fetchPreview(path, mediaType).then(() => {
      if (!cancelled) forceRender((n) => n + 1)
    })

    return () => {
      cancelled = true
    }
  }, [path, mediaType])

  if (!path || mediaType === 'video') return { dataUrl: null, failed: false }

  const cached = cache.get(path)
  return cached
    ? { dataUrl: cached.dataUrl, failed: cached.failed }
    : { dataUrl: null, failed: false }
}
