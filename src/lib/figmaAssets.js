const assetUrl = (name) => `${import.meta.env.BASE_URL}figma-assets/${name}`

export const FIGMA_ASSETS = {
  bgStar: assetUrl('bg-star.png'),
  uploadHoverBase: assetUrl('upload-hover-base.png'),
  uploadGlowRect: assetUrl('upload-glow-rect.svg'),
  uploadGlowEllipseLarge: assetUrl('upload-glow-ellipse-large.svg'),
  uploadGlowEllipseSmall: assetUrl('upload-glow-ellipse-small.svg'),
  logo: assetUrl('capcut-logo.svg'),
  wikiArrow: assetUrl('wiki-arrow.svg'),
  close: assetUrl('close.svg'),
  arrowLeft: assetUrl('arrow-left.svg'),
  arrowRight: assetUrl('arrow-right.svg'),
  chevronRight: assetUrl('chevron-right.svg'),
  copy: assetUrl('copy.svg'),
}

export const WIKI_URL = 'https://bytedance.larkoffice.com/docx/Yh2PdWeuCofrD4x3x1Mcbc4sn5b'
