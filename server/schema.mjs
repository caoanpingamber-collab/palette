import { z } from 'zod'
import { HttpError } from './errors.mjs'

const text = z.string().max(4096)
const rgb = z.tuple([z.number().min(0).max(255), z.number().min(0).max(255), z.number().min(0).max(255)])
const hex = z.string().regex(/^#[\da-f]{6}$/i)
const metric = z.object({ target: z.string().max(32).optional(), label: text, value: text, pass: z.boolean(), swatches: z.array(z.tuple([text, rgb])).max(8).optional() })
const check = z.object({
  key: z.enum(['hue', 'chroma', 'contrast', 'comp', 'clutter']), label: text, status: z.boolean(), issue: text,
  recommendation: text, detail: text.optional(), metricLabel: text.optional(), metric: text.optional(), metrics: z.array(metric).max(4).optional(),
})
const frame = z.object({
  width: z.number().int().positive().max(50000), height: z.number().int().positive().max(50000),
  palette: z.array(z.object({ hex, rgb, ratio: z.number().min(0).max(100) })).max(8),
  V: rgb, VHex: hex, cold: z.number().finite().nullable(), chroma: z.number().finite().nullable(),
  contrast: z.object({ title: z.number().nullable(), cardTop: z.number().nullable(), cardBottom: z.number().nullable() }),
  check: z.object({
    cxf: z.number().min(0).max(1), cyf: z.number().min(0).max(1),
    clutter: z.object({ secPct: z.number().min(0).max(100), secCount: z.number().int().nonnegative(), focus: z.object({ x: z.number(), y: z.number() }).nullable() }).nullable(),
  }),
  uiChecks: z.array(check).length(5), overallPass: z.boolean(), recommendation: text, prompt: text,
}).superRefine((value, ctx) => {
  if (new Set(value.uiChecks.map(item => item.key)).size !== 5 || value.overallPass !== value.uiChecks.every(item => item.status)) ctx.addIssue({ code: 'custom', message: '检测结论与明细不一致' })
})
const schema = z.object({
  version: z.literal(1), id: z.uuid(), kind: z.enum(['image', 'video']),
  fileName: z.string().min(1).max(255).refine(value => !/[\u0000-\u001f]/.test(value)), inspectedAt: z.iso.datetime(),
  buildVersion: z.string().max(128), rules: z.object({ version: z.string().min(1).max(100), thresholds: z.record(z.string().max(64), z.number().finite()) }),
  result: z.object({ overallPass: z.boolean(), recommendation: text, prompt: text, frames: z.object({ first: frame, last: frame.optional() }) }),
}).superRefine((value, ctx) => {
  const { first, last } = value.result.frames
  if ((value.kind === 'video') !== Boolean(last) || value.result.overallPass !== (first.overallPass && (!last || last.overallPass))) ctx.addIssue({ code: 'custom', message: '首尾帧与总体结论不一致' })
})

const status = z.enum(['passed', 'failed', 'review'])
const bottomKeys = ['dimensions', 'fileSize', 'copy', 'lines', 'textPosition', 'composition', 'thumbnail']
const bbox = z.object({ x0: z.number().finite(), y0: z.number().finite(), x1: z.number().finite(), y1: z.number().finite() })
const bottomCheck = z.object({
  key: z.enum(bottomKeys), label: text, status: z.boolean().nullable(), issue: text, recommendation: text,
  metricLabel: text, metric: text, detail: text,
  anchor: z.object({ x: z.number().finite().min(0).max(50000), y: z.number().finite().min(0).max(50000) }).nullable(),
})
const deriveStatus = rows => rows.some(item => item.status === false) ? 'failed' : rows.some(item => item.status == null) ? 'review' : 'passed'
const bottomFrame = z.object({
  inspectionType: z.literal('bottom'), width: z.number().int().positive().max(50000), height: z.number().int().positive().max(50000),
  layout: z.enum(['titleOnly', 'titleSubtitle', 'ambiguous']), uiChecks: z.array(bottomCheck).length(7), overallStatus: status, overallPass: z.boolean(), recommendation: text, prompt: text,
  evidence: z.object({
    ocr: z.object({ confidence: z.number().min(0).max(100), lines: z.array(z.object({ text, confidence: z.number().min(0).max(100), bbox })).max(30) }),
    visual: z.object({ x: z.number().min(0).max(1071), y: z.number().min(0).max(180), confidence: z.number().min(0).max(1), distance: z.number().finite().nonnegative() }).nullable(),
  }),
}).superRefine((value, ctx) => {
  if (new Set(value.uiChecks.map(item => item.key)).size !== 7 || value.overallStatus !== deriveStatus(value.uiChecks) || value.overallPass !== (value.overallStatus === 'passed')) ctx.addIssue({ code: 'custom', message: 'Bottom 检测结论与明细不一致' })
})
const bottomSchema = z.object({
  version: z.literal(2), inspectionType: z.literal('bottom'), id: z.uuid(), kind: z.literal('image'),
  fileName: z.string().min(1).max(255).refine(value => !/[\u0000-\u001f]/.test(value)), inspectedAt: z.iso.datetime(), buildVersion: z.string().max(128),
  animated: z.boolean(), animationFrameCount: z.number().int().min(1).max(300),
  rules: z.object({ version: z.literal('bottom-banner-qc-v1'), thresholds: z.object({ width: z.literal(1071), height: z.literal(180), maxBytes: z.literal(500000), titleOnlyMax: z.literal(57), titleMax: z.literal(28), subtitleMax: z.literal(48), maxLines: z.literal(2), circleX: z.literal(770), circleY: z.literal(0), circleDiameter: z.literal(180) }).strict() }),
  result: z.object({ overallPass: z.boolean(), overallStatus: status, recommendation: text, prompt: text, frames: z.object({ first: bottomFrame, last: bottomFrame.optional() }) }),
}).superRefine((value, ctx) => {
  const { first, last } = value.result.frames
  const rows = [first, ...(last ? [last] : [])].flatMap(frame => frame.uiChecks)
  if (value.animated !== Boolean(last) || value.animated !== (value.animationFrameCount > 1) || (last && (last.width !== first.width || last.height !== first.height)) || value.result.overallStatus !== deriveStatus(rows) || value.result.overallPass !== (value.result.overallStatus === 'passed')) ctx.addIssue({ code: 'custom', message: 'Bottom 动画帧与总体结论不一致' })
})

export function parseManifest(value) {
  const parsed = (value?.version === 2 ? bottomSchema : schema).safeParse(value)
  if (!parsed.success) throw new HttpError(400, '归档数据不完整或检测结论不一致，请重新检测后保存')
  return parsed.data
}
