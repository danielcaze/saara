import { useEffect, useState } from 'react'

import type { MediaType } from '../../../shared/types'

export interface ThumbnailResult {
  dataUrl: string | null
  failed: boolean
}

interface CachedThumbnailResult extends ThumbnailResult {
  path: string | null
  mediaType: MediaType
}

export function useThumbnailDataUrl(path: string | null, mediaType: MediaType): ThumbnailResult {
  const [result, setResult] = useState<CachedThumbnailResult>({
    path: null,
    mediaType,
    dataUrl: null,
    failed: false
  })

  useEffect(() => {
    if (!path || mediaType === 'video') return

    let cancelled = false
    window.saaraAPI.getThumbnail(path, mediaType).then((res) => {
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
