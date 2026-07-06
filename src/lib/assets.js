const svgData = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

export const PLACEHOLDER = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1296"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#66d9ff"/><stop offset=".55" stop-color="#3b82f6"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><rect width="800" height="1296" fill="url(#g)"/><circle cx="590" cy="430" r="210" fill="#ffffff" opacity=".22"/><path d="M110 860c150-180 330-210 560-90v526H110z" fill="#08111f" opacity=".35"/></svg>`)

export const IC_VIDEO = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#0c0c0e"/><path d="M11 9l9 5-9 5z" fill="#fff"/></svg>`)

export const IC_IMAGE = svgData(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 28"><rect width="28" height="28" rx="8" fill="#0c0c0e"/><path d="M7 19l4-4 3 2 4-5 3 7z" fill="#fff"/><circle cx="10" cy="10" r="1.6" fill="#fff"/></svg>`)
