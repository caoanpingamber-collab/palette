import { useEffect, useRef, useState } from 'react'
import ResultPage from './components/ResultPage'
import PreviewPage from './components/PreviewPage'
import Grainient from './components/Grainient/Grainient'
import PatternRefraction from './components/PatternRefraction/PatternRefraction'
import HistoryAdmin from './components/HistoryAdmin'
import { approvedAdminUrl, archiveInspection, isArchiveEnabled, prepareArchive } from './lib/history.mjs'
import { bannerCheck, extract } from './lib/color'
import { exportReport } from './lib/report'
import { FIGMA_ASSETS, WIKI_URL } from './lib/figmaAssets'
import { gsap, useGSAP } from './lib/gsap'
import { downloadBottomPreview } from './lib/bottomPreview'
import {
  LIMITS,
  buildFrameResult,
  buildImageResult,
  buildVideoResult,
  colorHex,
  currentFrame,
} from './lib/analysis'

function extractFrames(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    let first = null

    const grab = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    }
    const done = (frames) => {
      URL.revokeObjectURL(url)
      resolve(frames)
    }

    video.onloadedmetadata = () => {
      video.currentTime = 0.03
    }
    video.onseeked = () => {
      if (first == null) {
        first = grab()
        const duration = video.duration
        if (Number.isFinite(duration) && duration > 0.12) video.currentTime = duration - 0.05
        else done({ first, last: first })
      } else {
        done({ first, last: grab() })
      }
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('视频解码失败（编码可能不支持）'))
    }
    video.src = url
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片读取失败'))
    img.src = src
  })
}

async function analyzeSrc(src) {
  const img = await loadImage(src)
  return buildFrameResult({
    img,
    src,
    data: extract(img, 4),
    check: bannerCheck(img),
  })
}

function downloadHref(href, fileName) {
  const a = document.createElement('a')
  a.href = href
  a.download = fileName
  a.click()
}

function Logo() {
  return (
    <img src={FIGMA_ASSETS.logo} alt="CapCut" className="h-6 w-[94.617px]" />
  )
}

function HomePage({ onPickFile, error, loading, onNotice, mode, onModeChange }) {
  const inputId = 'banner-qc-file-input'
  const rootRef = useRef(null)
  const tabsRef = useRef(null)
  const tabIndicatorRef = useRef(null)
  const uploadRef = useRef(null)
  const uploadGradientRef = useRef(null)
  const uploadSpotRef = useRef(null)
  const uploadHintTimerRef = useRef(null)
  const spotXToRef = useRef(null)
  const spotYToRef = useRef(null)
  const activeTab = mode
  const [uploadVisualActive, setUploadVisualActive] = useState(false)

  const { contextSafe } = useGSAP(
    () => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      if (uploadSpotRef.current) {
        gsap.set(uploadSpotRef.current, { autoAlpha: 0, '--spot-x': 300, '--spot-y': 80 })
        spotXToRef.current = gsap.quickTo(uploadSpotRef.current, '--spot-x', { duration: 0.72, ease: 'power3.out' })
        spotYToRef.current = gsap.quickTo(uploadSpotRef.current, '--spot-y', { duration: 0.72, ease: 'power3.out' })
      }
      if (uploadGradientRef.current) {
        gsap.set(uploadGradientRef.current, { autoAlpha: 0 })
      }

      if (reduceMotion) {
        gsap.set('.home-animate', { autoAlpha: 1, clearProps: 'transform' })
        return () => {
          spotXToRef.current = null
          spotYToRef.current = null
        }
      }

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.home-nav', { y: -12, autoAlpha: 0, duration: 0.42 })
        .from('.home-tabs', { y: 14, scale: 0.98, autoAlpha: 0, duration: 0.42 }, '-=0.18')
        .from('.home-title', { y: 22, skewX: -8, autoAlpha: 0, duration: 0.5 }, '-=0.2')
        .from('.home-subtitle', { y: 10, autoAlpha: 0, duration: 0.34 }, '-=0.22')
        .from('.home-upload', { y: 24, scale: 0.97, autoAlpha: 0, duration: 0.48 }, '-=0.12')

      return () => {
        spotXToRef.current = null
        spotYToRef.current = null
      }
    },
    { scope: rootRef },
  )

  useGSAP(
    () => {
      if (!tabIndicatorRef.current) return
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      gsap.to(tabIndicatorRef.current, {
        x: 0,
        xPercent: activeTab === 'bottom' ? 100 : 0,
        duration: reduceMotion ? 0 : 0.42,
        ease: 'power3.inOut',
        overwrite: 'auto',
      })
    },
    { scope: rootRef, dependencies: [activeTab] },
  )

  useEffect(() => () => {
    if (uploadHintTimerRef.current) window.clearTimeout(uploadHintTimerRef.current)
  }, [])

  const clearUploadHint = () => {
    if (uploadHintTimerRef.current) {
      window.clearTimeout(uploadHintTimerRef.current)
      uploadHintTimerRef.current = null
    }
  }
  const submitFile = (file) => {
    if (file) {
      clearUploadHint()
      onPickFile(file)
    }
  }
  const pickTab = (tab) => {
    if (!loading) onModeChange(tab)
  }
  const moveUploadSpot = contextSafe((e) => {
    const rect = uploadRef.current?.getBoundingClientRect()
    if (!rect || typeof e?.clientX !== 'number') return
    spotXToRef.current?.(e.clientX - rect.left)
    spotYToRef.current?.(e.clientY - rect.top)
  })
  const showUploadGlow = contextSafe((e) => {
    if (!uploadRef.current) return
    setUploadVisualActive(true)
    moveUploadSpot(e)
    gsap.to(uploadRef.current, { scale: 1.012, borderRadius: 40, duration: 0.24, ease: 'power2.out', overwrite: 'auto' })
    if (uploadGradientRef.current) {
      gsap.to(uploadGradientRef.current, { autoAlpha: 1, duration: 0.34, ease: 'power2.out', overwrite: 'auto' })
    }
    if (uploadSpotRef.current) {
      gsap.to(uploadSpotRef.current, { autoAlpha: 0.24, duration: 0.36, ease: 'power2.out', overwrite: 'auto' })
    }
  })
  const hideUploadGlow = contextSafe(() => {
    if (!uploadRef.current) return
    gsap.to(uploadRef.current, { scale: 1, borderRadius: 28, duration: 0.28, ease: 'power2.out', overwrite: 'auto' })
    if (uploadGradientRef.current) {
      gsap.to(uploadGradientRef.current, {
        autoAlpha: 0,
        duration: 0.24,
        ease: 'power2.out',
        overwrite: 'auto',
        onComplete: () => setUploadVisualActive(false),
      })
    } else {
      setUploadVisualActive(false)
    }
    if (uploadSpotRef.current) {
      gsap.to(uploadSpotRef.current, { autoAlpha: 0, duration: 0.28, ease: 'power2.out', overwrite: 'auto' })
    }
  })
  const showUploadFallbackHint = () => {
    if (loading) return
    clearUploadHint()
    uploadHintTimerRef.current = window.setTimeout(() => {
      onNotice?.('如果没有弹出文件选择器，请拖拽或粘贴上传，或用系统浏览器打开')
      uploadHintTimerRef.current = null
    }, 1000)
  }

  return (
    <main ref={rootRef} className={`${mode === 'bottom' ? 'bottom-home ' : ''}relative min-h-screen overflow-hidden bg-[#f1f1f1] text-[#111827]`}>
      {import.meta.env.VITE_HIDE_DECORATIVE_BACKGROUND !== 'true' && <>
      <PatternRefraction
        src={FIGMA_ASSETS.bgStar}
        className="home-bg-star home-bg-star--top"
        strengthMin={10}
        strengthMax={34}
        duration={6000}
      />
      <PatternRefraction
        src={FIGMA_ASSETS.bgStar}
        className="home-bg-star home-bg-star--bottom"
        strengthMin={10}
        strengthMax={34}
        duration={6000}
      />

      </>}
      <nav className="home-nav relative z-10 flex h-[60px] items-center justify-between px-6">
        <Logo />
        <a
          href={WIKI_URL}
          target="_blank"
          rel="noreferrer"
          className="flex h-8 items-center gap-1 rounded-full px-2 font-['PingFang_SC'] text-[17px] font-normal transition-[opacity,transform,background-color] duration-200 hover:-translate-y-0.5 hover:bg-white/60 hover:opacity-80 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/15"
        >
          Wiki <img src={FIGMA_ASSETS.wikiArrow} alt="" className="size-3" />
        </a>
      </nav>

      <section className="relative z-10 mx-auto flex w-[730px] max-w-[calc(100vw-40px)] flex-col items-center pt-[100px]">
        <div ref={tabsRef} className="home-tabs relative mb-10 flex rounded-full bg-black/[.03] p-1 will-change-transform">
          <span
            ref={tabIndicatorRef}
            className="pointer-events-none absolute left-1 top-1 h-11 w-[195px] rounded-full bg-[#f9f9f9] shadow-[0_10px_30px_rgba(0,0,0,.08)] will-change-transform"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => pickTab('header')}
            aria-pressed={activeTab === 'header'}
            className={`relative z-10 h-11 w-[195px] rounded-full font-['PingFang_SC'] text-[17px] outline-none transition-[color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-black/15 ${
              activeTab === 'header' ? 'font-normal text-[#111827]' : 'font-light text-black/55 hover:text-black/75'
            }`}
          >
            Header Banner
          </button>
          <button
            type="button"
            onClick={() => pickTab('bottom')}
            aria-pressed={activeTab === 'bottom'}
            className={`relative z-10 h-11 w-[195px] rounded-full font-['PingFang_SC'] text-[17px] outline-none transition-[color,transform] duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.98] focus-visible:ring-2 focus-visible:ring-black/15 ${
              activeTab === 'bottom' ? 'font-normal text-[#111827]' : 'font-light text-black/55 hover:text-black/75'
            }`}
          >
            Bottom banner
          </button>
        </div>

        <h1 className="home-title whitespace-nowrap font-['Floane'] text-[60px] font-bold leading-[1.2] tracking-[1px] will-change-transform max-[760px]:text-[42px]">
          <span className="inline-block -skew-x-12">{mode === 'bottom' ? 'Bottom banner detection' : 'Homepage Banner Detection'}</span>
        </h1>
        <p className="home-subtitle mt-3 font-['PingFang_SC'] text-[14px] font-light will-change-transform">
          {mode === 'bottom' ? 'Upload a 1071*180 banner material' : 'Check specifications after uploading 800×1296 banner materials'}
        </p>

        <label
          ref={uploadRef}
          onPointerEnter={showUploadGlow}
          onPointerLeave={hideUploadGlow}
          onPointerMove={moveUploadSpot}
          onFocus={showUploadGlow}
          onBlur={hideUploadGlow}
          onDragOver={(e) => {
            e.preventDefault()
            showUploadGlow()
            moveUploadSpot(e)
          }}
          onDragLeave={hideUploadGlow}
          onDrop={(e) => {
            e.preventDefault()
            hideUploadGlow()
            if (loading) return
            submitFile(e.dataTransfer.files[0])
          }}
          className={`home-upload group relative mt-10 flex h-[160px] w-[600px] max-w-full items-center justify-center overflow-hidden rounded-[28px] border-[0.5px] border-black/[.08] bg-[#f9f9f9] px-5 text-center outline-none transition-[border-color,filter] duration-200 will-change-transform hover:border-black/25 focus-within:ring-1 focus-within:ring-[#3e8df6]/60 ${
            loading ? 'cursor-wait opacity-80' : 'cursor-pointer'
          }`}
          aria-disabled={loading}
        >
          <div ref={uploadGradientRef} className="upload-grainient pointer-events-none absolute -inset-24 scale-100 opacity-0 will-change-opacity">
            <Grainient
              color1="#CEFFEC"
              color2="#3B79FF"
              color3="#ceffe7"
              timeSpeed={0.72}
              colorBalance={-0.31}
              warpStrength={2.35}
              warpFrequency={6.8}
              warpSpeed={2.15}
              warpAmplitude={30}
              blendAngle={33}
              blendSoftness={0}
              rotationAmount={590}
              noiseScale={1.65}
              grainAmount={0}
              grainScale={2.8}
              grainAnimated
              contrast={1.35}
              gamma={1}
              saturation={1}
              centerX={0.06}
              centerY={0.23}
              zoom={1.05}
              active={uploadVisualActive && !loading}
            />
          </div>
          <div ref={uploadSpotRef} className="upload-follow-spot pointer-events-none absolute z-[5] opacity-0" />
          <div
            className={`relative z-10 flex flex-col gap-2 font-['CapCut_Sans_Text'] transition-colors duration-200 ${
              uploadVisualActive ? 'text-white' : 'text-[#111827]'
            }`}
          >
            <span className="text-[19px]">{loading ? '检测中...' : mode === 'bottom' ? '上传banner' : '上传图片或视频'}</span>
            <span className={`text-[14px] transition-opacity duration-200 ${uploadVisualActive ? 'opacity-70' : 'opacity-40'}`}>
              {mode === 'bottom' ? 'GIF图大小不超过500kb' : '图片≤300KB · 视频≤500KB'}
            </span>
          </div>
          <input
            id={inputId}
            type="file"
            accept={mode === 'bottom' ? 'image/png,image/jpeg,image/webp,image/gif' : 'image/png,image/jpeg,image/jpg,image/webp,image/gif,video/mp4'}
            className="home-upload-input absolute inset-0 z-20 h-full w-full cursor-pointer opacity-0 border-0 border-solid border-[rgb(234,179,8)] disabled:cursor-wait"
            disabled={loading}
            onPointerEnter={showUploadGlow}
            onPointerLeave={hideUploadGlow}
            onPointerMove={moveUploadSpot}
            onFocus={showUploadGlow}
            onBlur={hideUploadGlow}
            onClick={showUploadFallbackHint}
            onChange={(e) => {
              submitFile(e.target.files[0])
              e.target.value = ''
            }}
            aria-label={mode === 'bottom' ? '上传banner' : '上传图片或视频'}
          />
        </label>

        {error && <p className="mt-4 rounded-full bg-white px-4 py-2 text-[13px] text-[#ff3436] shadow-sm">{error}</p>}
      </section>
    </main>
  )
}

function AdministratorRoute({ onHome }) {
  const destination = import.meta.env.VITE_HISTORY_ADMIN_URL
  useEffect(() => { if (destination) window.location.replace(approvedAdminUrl(destination)) }, [destination])
  return destination ? <main className="history-app history-loading" role="status">正在打开管理后台</main> : <HistoryAdmin onHome={onHome} />
}

export default function App() {
  const [page, setPage] = useState(() => /\/admin\/?$/.test(window.location.pathname) ? 'admin' : 'home')
  const [result, setResult] = useState(null)
  const [mode, setMode] = useState('header')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const videoUrlRef = useRef(null)
  const toastTimerRef = useRef(null)
  const analysisAbortRef = useRef(null)

  useEffect(() => {
    const onPop = () => setPage(/\/admin\/?$/.test(window.location.pathname) ? 'admin' : 'home')
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (page === 'home' && mode === 'bottom') {
      void import('./lib/bottomMedia').then(({ preloadBottomOcr }) => preloadBottomOcr()).catch(() => {})
    }
  }, [page, mode])

  const homeFromHistory = () => {
    window.history.pushState({}, '', window.location.pathname.replace(/\/admin\/?$/, '/') || '/')
    setPage('home')
  }
  const beginArchive = async (file, nextResult) => {
    try {
      if (!await isArchiveEnabled(nextResult.inspectionType === 'bottom' ? 2 : 1)) return
      await archiveInspection(await prepareArchive(file, nextResult))
    } catch (failure) {
      console.warn('检测历史保存失败：', failure.message)
    }
  }

  const flash = (text) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    setToast(text)
    toastTimerRef.current = window.setTimeout(() => {
      setToast('')
      toastTimerRef.current = null
    }, 1600)
  }

  const releaseVideoUrl = () => {
    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current)
      videoUrlRef.current = null
    }
  }

  useEffect(
    () => () => {
      releaseVideoUrl()
      analysisAbortRef.current?.abort()
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    const onPaste = (e) => {
      if (page !== 'home') return
      const items = e.clipboardData?.items || []
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.indexOf('image') === 0) {
          handleFile(items[i].getAsFile())
          break
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [page, mode, loading])

  const handleFile = async (file) => {
    if (!file || loading) return
    setError('')
    setLoading(true)

    const isImage = /^image\//.test(file.type)
    const isVideo = /^video\/mp4$/.test(file.type) || /\.mp4$/i.test(file.name || '')
    try {
      if (mode === 'bottom') {
        releaseVideoUrl()
        const controller = new AbortController()
        analysisAbortRef.current = controller
        const { analyzeBottomFile } = await import('./lib/bottomMedia')
        const nextResult = await analyzeBottomFile(file, { signal: controller.signal })
        controller.signal.throwIfAborted()
        videoUrlRef.current = nextResult.mediaUrl
        setResult(nextResult); setPage('result'); void beginArchive(file, nextResult)
        return
      }
      if (!isImage && !isVideo) throw new Error('只支持图片或 MP4 视频')
      if (isImage && file.size > LIMITS.imageBytes) throw new Error(`图片 ${(file.size / 1000).toFixed(0)}KB 超出上限 300KB，请压缩后再传`)
      if (isVideo && file.size > LIMITS.videoBytes) throw new Error(`视频 ${(file.size / 1000).toFixed(0)}KB 超出上限 500KB，请压缩后再传`)

      releaseVideoUrl()

      if (isImage) {
        const src = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = () => reject(new Error('图片读取失败'))
          reader.readAsDataURL(file)
        })
        const frame = await analyzeSrc(src)
        const nextResult = buildImageResult(frame, file.name || 'banner.png')
        setResult(nextResult)
        setPage('result')
        void beginArchive(file, nextResult)
        return
      }

      const videoUrl = URL.createObjectURL(file)
      videoUrlRef.current = videoUrl
      const extracted = await extractFrames(file)
      const frames = {
        first: await analyzeSrc(extracted.first),
        last: await analyzeSrc(extracted.last),
      }
      const nextResult = buildVideoResult({ frames, videoUrl, fileName: file.name || 'banner.mp4' })
      setResult(nextResult)
      setPage('result')
      void beginArchive(file, nextResult)
    } catch (err) {
      releaseVideoUrl()
      setError(err.message || '处理失败')
    } finally {
      setLoading(false)
    }
  }

  const closeResult = () => {
    releaseVideoUrl()
    setResult(null)
    setError('')
    setPage('home')
  }

  const switchFrame = (which) => {
    setResult((prev) => {
      if (!prev || (prev.kind !== 'video' && !prev.animated) || !prev.frames?.[which]) return prev
      const frame = prev.frames[which]
      return {
        ...prev,
        activeFrame: which,
        sourceUrl: frame.src,
        checks: frame.uiChecks,
        palette: frame.palette,
      }
    })
  }

  const downloadBanner = () => {
    const frame = currentFrame(result)
    if (!result || !frame) return
    if (result.inspectionType === 'bottom') { downloadHref(result.mediaUrl, result.fileName); return }
    if (result.kind === 'video') downloadHref(result.videoUrl, result.fileName || 'banner.mp4')
    else downloadHref(frame.src, 'banner.png')
  }

  const downloadPreview = async (variant) => {
    const frame = currentFrame(result)
    if (!result || !frame) return
    if (result.inspectionType === 'bottom') {
      try { await downloadBottomPreview(frame, variant) } catch { flash('预览导出失败') }
      return
    }
    if (result.kind === 'video') downloadHref(result.videoUrl, result.fileName || 'banner-preview.mp4')
    else downloadHref(frame.src, 'banner-preview.png')
  }

  const exportCurrentReport = async () => {
    const frame = currentFrame(result)
    if (!result || !frame) return
    try {
      await exportReport({ result, frame })
      flash('报告已导出')
    } catch {
      flash('导出失败')
    }
  }

  const copyConfig = async () => {
    const frame = currentFrame(result)
    if (!frame) return
    const text = `卡片变量色 V = ${colorHex(frame.V)}`
    try {
      await navigator.clipboard?.writeText(text)
      flash('配置色已复制')
    } catch {
      flash(text)
    }
  }

  return (
    <>
      {page === 'home' && <HomePage onPickFile={handleFile} error={error} loading={loading} onNotice={flash} mode={mode} onModeChange={(next) => { setMode(next); setError('') }} />}
      {page === 'admin' && <AdministratorRoute onHome={homeFromHistory} />}
      {page === 'result' && result && (
        <ResultPage
          result={result}
          onClose={closeResult}
          onSwitchFrame={switchFrame}
          onDownloadBanner={downloadBanner}
          onDownloadPreview={downloadPreview}
          onExportReport={exportCurrentReport}
          onCopyConfig={copyConfig}
          onNeedsConfirmation={flash}
        />
      )}
      {page === 'preview' && <PreviewPage result={result} onBack={() => setPage(result ? 'result' : 'home')} />}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-[13px] text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  )
}
