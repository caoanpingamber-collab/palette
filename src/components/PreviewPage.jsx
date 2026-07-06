export default function PreviewPage({ result, onBack }) {
  return (
    <main className="min-h-screen bg-[#f1f1f1] text-[#111827]">
      <button
        type="button"
        onClick={onBack}
        className="fixed left-[30px] top-[30px] z-10 grid size-[44px] place-items-center rounded-full bg-[#f9f9f9] text-[24px] shadow-[0_8px_30px_rgba(0,0,0,.08)] outline-none transition-[background-color,transform] duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-black/15"
        aria-label="返回检测结果"
      >
        ×
      </button>
      <section className="flex min-h-screen items-center justify-center px-6 text-center">
        <div>
          <div className="mb-3 text-[12px] text-black/40">Preview page placeholder</div>
          <h1 className="text-[28px] font-semibold">预览页口子已预留</h1>
          <p className="mt-3 max-w-[420px] text-[14px] leading-6 text-black/50">
            当前结果对象已接入：{result?.kind === 'video' ? '视频' : '图片'}。后续可以在这里继续还原独立预览页。
          </p>
        </div>
      </section>
    </main>
  )
}
