import { useEffect, useState } from 'react'

import type { MediaType } from '../../../shared/types'

export interface LightboxPreviewResult {
  dataUrl: string | null
  failed: boolean
}

interface CachedPreviewResult extends LightboxPreviewResult {
  path: string | null
  mediaType: MediaType
}

// Separate from useThumbnailDataUrl: the Lightbox needs a much larger image
// than the grid thumbnail, backed by a different IPC channel
// (getLightboxPreview vs. getThumbnail) that prefers EXIF PreviewImage over
// ThumbnailImage. Same stale-response guard as useThumbnailDataUrl — a fast
// path change shouldn't flash the previous photo's dataUrl.
export function useLightboxPreview(path: string | null, mediaType: MediaType): LightboxPreviewResult {
  const [result, setResult] = useState<CachedPreviewResult>({
    path: null,
    mediaType,
    dataUrl: null,
    failed: false
  })

  useEffect(() => {
    if (!path || mediaType === 'video') return

    let cancelled = false
    window.saaraAPI.getLightboxPreview(path, mediaType).then((res) => {
      if (cancelled) return
      setResult(
        res
          ? { path, mediaType, dataUrl: res.dataUrl, failed: false }
          : { path, mediaType, dataUrl: null, failed: true }
      )
    })

    return () => {
      cancelled = true
    }
  }, [path, mediaType])

  if (result.path !== path || result.mediaType !== mediaType) {
    return { dataUrl: null, failed: false }
  }

  return result
}
