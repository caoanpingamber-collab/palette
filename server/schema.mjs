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

export function parseManifest(value) {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new HttpError(400, '归档数据不完整或检测结论不一致，请重新检测后保存')
  return parsed.data
}
