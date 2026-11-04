import { X } from 'lucide-react'
import { BOTTOM_CARDS, BOTTOM_LAYERS, bottomIconUrl, bottomLayerUrl } from '../lib/bottomPreview'
import './BottomPreview.css'

export default function BottomPreview({ src, variant = 'full', frame }) {
  const thumbnail = variant === 'thumbnail'
  return (
    <div className="bottom-phone" data-bottom-variant={variant}>
      <div className="bottom-phone-content">
        {BOTTOM_LAYERS.map(layer => <img key={layer.name} src={bottomLayerUrl(layer.name, variant)} alt="" draggable="false" className="bottom-phone-layer" style={{ top: layer.y, height: layer.height }} />)}
        <div className="bottom-phone-topbar">
          <span className="bottom-phone-time">9:41</span>
          <img src={bottomIconUrl('cellular')} alt="" className="bottom-phone-cellular" />
          <img src={bottomIconUrl('wifi')} alt="" className="bottom-phone-wifi" />
          <div className="bottom-phone-battery"><span /><img src={bottomIconUrl('cap')} alt="" /></div>
          <div className="bottom-phone-standard"><img src={bottomIconUrl('svip')} alt="" /><img src={bottomIconUrl('standard')} alt="" /></div>
          <span className="bottom-phone-search"><img src={bottomIconUrl('search')} alt="" /></span>
        </div>
        <div className="bottom-phone-title"><span>Bilingual captions</span><strong>AI bilingual captions <img src={bottomIconUrl('chevron')} alt="" /></strong></div>
        {BOTTOM_CARDS.map(card => <div key={card.icon} className="bottom-phone-card" style={{ left: card.x, width: card.width }}><img src={bottomIconUrl(card.icon)} alt="" /><span>{card.label}</span></div>)}
        <div className={`bottom-banner-slot ${thumbnail ? 'bottom-banner-slot--thumbnail' : ''}`} data-bottom-slot={thumbnail ? 'thumbnail' : 'full'}>
          <img src={src} alt={thumbnail ? 'Bottom Banner 圆形缩略图' : 'Bottom Banner 完整预览'} draggable="false" style={thumbnail ? { width: (frame?.width || 1071) * 59.16 / 180, height: (frame?.height || 180) * 59.16 / 180 } : undefined} />
        </div>
        <span className={`bottom-banner-dismiss ${thumbnail ? 'bottom-banner-dismiss--thumbnail' : ''}`} aria-hidden="true"><X size={8} strokeWidth={2.5} /></span>
      </div>
    </div>
  )
}
