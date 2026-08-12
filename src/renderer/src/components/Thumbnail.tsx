import { useEffect, useState } from 'react'
import { FilmSlate, ImageBroken } from '@phosphor-icons/react'
import type { MediaType } from '../../../shared/types'

interface Props {
  path: string
  mediaType: MediaType
}

export function Thumbnail({ path, mediaType }: Props): React.JSX.Element {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (mediaType === 'video') {
      return
    }
    window.saaraAPI.getThumbnail(path, mediaType).then((result) => {
      if (cancelled) return
      if (result) setDataUrl(result.dataUrl)
      else setFailed(true)
    })
    return () => {
      cancelled = true
    }
  }, [path, mediaType])

  if (mediaType === 'video')
    return (
      <div className="thumb thumb-icon">
        <FilmSlate size={24} />
      </div>
    )
  if (failed)
    return (
      <div className="thumb thumb-icon">
        <ImageBroken size={24} />
      </div>
    )
  if (!dataUrl) return <div className="thumb" />
  return <img className="thumb" src={dataUrl} alt="" />
}
