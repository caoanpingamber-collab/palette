import { IC_IMAGE, IC_VIDEO } from './assets'

export const PHONE_ASSETS = {
  lower: `${import.meta.env.BASE_URL}fixed2.png`,
  navigation: `${import.meta.env.BASE_URL}nav.png`,
  status: `${import.meta.env.BASE_URL}figma-assets/preview-status-bar.png`,
  tools: `${import.meta.env.BASE_URL}figma-assets/preview-fixed-section.png`,
}

export const PHONE_COPY = { subtitle: 'subtitle caption', title: 'One main banner title' }
export const PHONE_CARDS = [
  { left: 16, width: 222, icon: IC_VIDEO, label: 'New video' },
  { left: 246, width: 131, icon: IC_IMAGE, label: 'New image' },
]

export function phoneTint(rgb = [191, 227, 255]) {
  const tint = rgb?.slice(0, 3) || []
  return tint.length === 3 && tint.every(Number.isFinite) ? tint : [191, 227, 255]
}

export function phoneCardBackground(rgb) {
  const color = `rgba(${phoneTint(rgb).join(',')},.8)`
  return {
    backgroundColor: color,
    backgroundImage: `linear-gradient(rgba(255,255,255,.6),rgba(255,255,255,.6)),linear-gradient(180deg, ${color} 0%, rgba(255,255,255,.75) 100%)`,
  }
}
