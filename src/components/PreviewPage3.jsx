const figmaAssetUrl = (name) => `${import.meta.env.BASE_URL}figma-assets/${name}`
const safeRgb = (rgb = [191, 227, 255]) => {
  const [r, g, b] = rgb
  return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : [191, 227, 255]
}

export function PreviewPage3Canvas({ V = [191, 227, 255] }) {
  const tint = safeRgb(V)
  const tint80 = `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0.8)`

  return (
    <div
      className="relative h-[852px] w-[393px] overflow-hidden bg-[rgba(178,213,230,0.25)]"
      data-preview-page="3"
      style={{ backdropFilter: 'blur(200px)' }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(90deg, rgba(39, 60, 86, 0.2) 0%, rgba(39, 60, 86, 0.2) 100%), linear-gradient(90deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 100%)',
        }}
      />
      <div
        className="absolute inset-0"
        data-preview-page-3-layer="L1"
        style={{ backgroundImage: `linear-gradient(180deg, ${tint80} 0%, rgba(255, 255, 255, 0.75) 100%)` }}
      />

      <div
        className="absolute left-0 top-0 h-[852px] w-[393px]"
        style={{
          maskImage: `url("${figmaAssetUrl('preview-page-3-mask.svg')}")`,
          WebkitMaskImage: `url("${figmaAssetUrl('preview-page-3-mask.svg')}")`,
          maskPosition: '0 0',
          WebkitMaskPosition: '0 0',
          maskRepeat: 'no-repeat',
          WebkitMaskRepeat: 'no-repeat',
          maskSize: '393px 729px',
          WebkitMaskSize: '393px 729px',
        }}
      >
        <img
          src={figmaAssetUrl('preview-page-3-body.png')}
          alt=""
          className="absolute inset-0 size-full object-cover"
          draggable="false"
        />
      </div>

      <div className="absolute bottom-px left-0 right-0 flex h-[122px] flex-col items-center justify-center gap-3 pt-4">
        <div className="flex h-[60px] w-full items-center justify-center">
          <button
            type="button"
            className="grid size-[60px] place-items-center rounded-full border border-white/20 bg-[rgba(46,74,102,0.06)] p-[9px] outline-none transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-black/15"
            aria-label="Close tools"
          >
            <img src={figmaAssetUrl('preview-page-3-close.svg')} alt="" className="size-6" />
          </button>
        </div>
        <div className="relative h-[34px] w-full">
          <div className="absolute bottom-2 left-1/2 h-[5px] w-[139px] -translate-x-1/2 rounded-full bg-[#090c14]" />
        </div>
      </div>
    </div>
  )
}

export function PreviewPage3Frame({ V = [191, 227, 255] }) {
  return (
    <div className="relative h-[694px] w-[320px] flex-[0_0_auto] overflow-hidden rounded-[24px] border border-black/10 bg-white">
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: 'scale(0.8142)' }}>
        <PreviewPage3Canvas V={V} />
      </div>
    </div>
  )
}

export default function PreviewPage3({ onBack }) {
  return (
    <main className="fixed inset-0 z-40 min-h-screen bg-[#e5e5e5] text-[#111827]">
      <button
        type="button"
        onClick={onBack}
        className="fixed left-[30px] top-[30px] z-20 grid size-[44px] place-items-center rounded-full bg-[#f9f9f9] text-[24px] shadow-[0_8px_30px_rgba(0,0,0,.08)] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
        aria-label="返回检测结果"
      >
        x
      </button>

      <section className="flex min-h-screen items-center justify-center px-6">
        <PreviewPage3Canvas />
      </section>
    </main>
  )
}
