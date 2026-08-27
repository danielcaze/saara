import { FilmSlate, ImageBroken } from '@phosphor-icons/react'

import type { MediaType } from '../../../shared/types'

import { useThumbnailDataUrl } from '../hooks/useThumbnailDataUrl'

interface Props {
  path: string
  mediaType: MediaType
}

export function Thumbnail({ path, mediaType }: Props): React.JSX.Element {
  const { dataUrl, failed } = useThumbnailDataUrl(path, mediaType)
  const fallbackIcon = mediaType === 'video' ? <FilmSlate size={24} /> : <ImageBroken size={24} />

  if (failed) return <div className="thumb thumb-icon">{fallbackIcon}</div>
  if (!dataUrl) return <div className="thumb" />
  return <img className="thumb" src={dataUrl} alt="" />
}
