// Pure progress logic: no Firebase or React, so it is unit-tested in Node.
import type { ModelDefinition } from '../models/ModelDefinition'

/** One model's saved progress: users/{uid}/progress/{modelId}. */
export interface ModelProgress {
  /** Part ids opened in Study. */
  studied: string[]
  /** Assemblies completed. */
  assemblies: number
  bestAssemblyMs: number | null
  lastOpenedAt: number | null
}

export const emptyProgress: ModelProgress = {
  studied: [],
  assemblies: 0,
  bestAssemblyMs: null,
  lastOpenedAt: null,
}

/** Reads a Firestore document defensively: old or hand-edited data never crashes the app. */
export function parseProgress(data: Record<string, unknown> | undefined): ModelProgress {
  if (!data) return emptyProgress
  const studied = Array.isArray(data.studied)
    ? data.studied.filter((s): s is string => typeof s === 'string')
    : []
  const assemblies =
    typeof data.assemblies === 'number' && data.assemblies > 0 ? Math.floor(data.assemblies) : 0
  const best = typeof data.bestAssemblyMs === 'number' && data.bestAssemblyMs > 0 ? data.bestAssemblyMs : null
  return { studied, assemblies, bestAssemblyMs: best, lastOpenedAt: toMillis(data.lastOpenedAt) }
}

/** Accepts a Firestore Timestamp (anything with toMillis) or a number. */
export function toMillis(value: unknown): number | null {
  try {
    const ms =
      typeof value === 'number'
        ? value
        : value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function'
          ? value.toMillis()
          : null
    return typeof ms === 'number' && Number.isFinite(new Date(ms).getTime()) ? ms : null
  } catch {
    return null
  }
}

/** Returns null when the part was already studied (nothing to save). */
export function withStudied(p: ModelProgress, partId: string): ModelProgress | null {
  return p.studied.includes(partId) ? null : { ...p, studied: [...p.studied, partId] }
}

export function withAssembly(p: ModelProgress, ms: number): ModelProgress {
  const best = p.bestAssemblyMs === null ? ms : Math.min(p.bestAssemblyMs, ms)
  return { ...p, assemblies: p.assemblies + 1, bestAssemblyMs: best }
}

export interface ModelSummary {
  studied: number
  total: number
  assemblies: number
  bestAssemblyMs: number | null
  started: boolean
}

/** Only counts parts the model still has, so a renamed part never shows 19/18. */
export function summarize(def: ModelDefinition, p: ModelProgress | undefined): ModelSummary {
  const ids = new Set(def.parts.map((part) => part.id))
  const studied = p ? p.studied.filter((id) => ids.has(id)).length : 0
  return {
    studied,
    total: def.parts.length,
    assemblies: p?.assemblies ?? 0,
    bestAssemblyMs: p?.bestAssemblyMs ?? null,
    started: !!p && (p.lastOpenedAt !== null || studied > 0 || p.assemblies > 0),
  }
}

export function totals(defs: ModelDefinition[], byModel: Record<string, ModelProgress>) {
  const all = defs.map((def) => summarize(def, byModel[def.id]))
  return {
    modelsStarted: all.filter((s) => s.started).length,
    models: defs.length,
    studied: all.reduce((n, s) => n + s.studied, 0),
    parts: all.reduce((n, s) => n + s.total, 0),
    assemblies: all.reduce((n, s) => n + s.assemblies, 0),
  }
}

/** 151000 → "2:31"; an hour or more → "1:02:31". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
