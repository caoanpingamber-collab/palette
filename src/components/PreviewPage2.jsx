const figmaAssetUrl = (name) => `${import.meta.env.BASE_URL}figma-assets/${name}`
const safeRgb = (rgb = [191, 227, 255]) => {
  const [r, g, b] = rgb
  return [r, g, b].every((value) => Number.isFinite(value)) ? [r, g, b] : [191, 227, 255]
}

function StatusBar() {
  return (
    <div className="absolute left-0 top-0 h-[54px] w-full">
      <div className="absolute left-0 top-0 flex h-full w-[140px] items-center justify-center pt-[2px]">
        <span className="text-[17px] font-semibold leading-[22px] text-black" style={{ fontFamily: 'SF Pro, PingFang SC, system-ui, sans-serif' }}>
          9:41
        </span>
      </div>
      <div className="absolute right-[22px] top-[22px] flex items-center gap-[7px]">
        <img src={figmaAssetUrl('status-cellular.svg')} alt="" className="h-[12px] w-[19.2px]" />
        <img src={figmaAssetUrl('status-wifi.svg')} alt="" className="h-[12px] w-[17.142px]" />
        <div className="relative h-[13px] w-[27px]">
          <div className="absolute inset-y-0 left-0 w-[25px] rounded-[4.3px] border border-black/35" />
          <img src={figmaAssetUrl('status-cap.svg')} alt="" className="absolute right-0 top-[3.8px] h-[4.1px] w-[1.328px]" />
          <div className="absolute left-[2px] top-[2px] h-[9px] w-[21px] rounded-[2.5px] bg-black" />
        </div>
      </div>
    </div>
  )
}

export function PreviewPage2Canvas({ V = [191, 227, 255] }) {
  const tint = safeRgb(V)
  const buttonStyle = { backgroundColor: `rgba(${tint[0]}, ${tint[1]}, ${tint[2]}, 0.6)` }

  return (
    <div className="relative h-[852px] w-[393px] overflow-hidden bg-white">
      <StatusBar />

      <div className="absolute left-0 top-[53px] flex w-full gap-2 px-4 py-2">
        <button
          type="button"
          className="grid h-14 flex-1 place-items-center rounded-[12px] outline-none transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-black/15"
          style={buttonStyle}
          aria-label="New project"
        >
          <img src={figmaAssetUrl('preview-page-2-new.svg')} alt="" className="size-7" />
        </button>
        <button
          type="button"
          className="grid h-14 flex-1 place-items-center rounded-[12px] outline-none transition-transform duration-200 hover:scale-[1.015] active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-black/15"
          style={buttonStyle}
          aria-label="New image"
        >
          <img src={figmaAssetUrl('preview-page-2-image.svg')} alt="" className="size-7" />
        </button>
      </div>

      <img
        src={figmaAssetUrl('preview-page-2-body.png')}
        alt=""
        className="absolute left-0 top-[131px] h-[721px] w-[393px] object-cover"
        draggable="false"
      />
    </div>
  )
}

export function PreviewPage2Frame({ V = [191, 227, 255] }) {
  return (
    <div className="relative h-[694px] w-[320px] flex-[0_0_auto] overflow-hidden rounded-[24px] border border-black/10 bg-white">
      <div className="absolute left-0 top-0 origin-top-left" style={{ transform: 'scale(0.8142)' }}>
        <PreviewPage2Canvas V={V} />
      </div>
    </div>
  )
}

export default function PreviewPage2({ onBack }) {
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
        <PreviewPage2Canvas />
      </section>
    </main>
  )
}
