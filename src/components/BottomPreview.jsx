import { X } from 'lucide-react'
import Preview from './Preview'
import { BOTTOM_PHONE, bottomLayerUrl } from '../lib/bottomPreview'
import './BottomPreview.css'

export default function BottomPreview({ src, variant = 'full', frame }) {
  const thumbnail = variant === 'thumbnail'
  return (
    <Preview src={bottomLayerUrl('header')} V={BOTTOM_PHONE.tint} className="bottom-phone" data-bottom-variant={variant}>
      <div className="bottom-phone-content">
        <div className={`bottom-banner-slot ${thumbnail ? 'bottom-banner-slot--thumbnail' : ''}`} data-bottom-slot={thumbnail ? 'thumbnail' : 'full'}>
          <img src={src} alt={thumbnail ? 'Bottom Banner 圆形缩略图' : 'Bottom Banner 完整预览'} draggable="false" style={thumbnail ? { width: (frame?.width || 1071) * 59.16 / 180, height: (frame?.height || 180) * 59.16 / 180 } : undefined} />
        </div>
        <span className={`bottom-banner-dismiss ${thumbnail ? 'bottom-banner-dismiss--thumbnail' : ''}`} aria-hidden="true"><X size={8} strokeWidth={2.5} /></span>
      </div>
    </Preview>
  )
}
