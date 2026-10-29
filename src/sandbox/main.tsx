// Isolated sandbox for experimental code. Open it at /sandbox while `npm run dev` runs.
//
// Rules for this file:
// - Import nothing from the app (no src/* modules, stores, auth, Firebase or API routes).
//   Only React is allowed. Everything an experiment needs — components, mock data,
//   logic — lives below.
// - It is development only: sandbox.html is not a production build input.
// - Everything here expires at EXPIRES_AT. From then on the experiments no longer render
//   and everything they saved is wiped, whether the page is open or opened later.
// Kept in one file on purpose, so edits reload the page instead of hot-swapping components.
/* eslint-disable react/only-export-components */
import { StrictMode, useEffect, useState, type CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'

/** Expiry: 29 October 2026, 22:00 in this browser's local time. Change it to extend the sandbox. */
const EXPIRES_AT = new Date(2026, 9, 29, 22, 0, 0)

/** Everything the sandbox saves in the browser uses this prefix, so expiry can wipe it all and nothing else. */
const STORAGE_PREFIX = 'sandbox:'

const isExpired = (now = Date.now()) => now >= EXPIRES_AT.getTime()

/** Removes every key the sandbox stored. Never touches the app's own keys. */
function wipeSandboxStorage(): void {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_PREFIX)) localStorage.removeItem(key)
    for (const key of Object.keys(sessionStorage)) if (key.startsWith(STORAGE_PREFIX)) sessionStorage.removeItem(key)
  } catch {
    // Storage blocked (private window): nothing was saved, so nothing to wipe.
  }
}

/** useState that survives reloads until expiry (stored under the sandbox prefix). */
function useSandboxState<T>(key: string, initial: T): [T, (value: T) => void] {
  const storageKey = STORAGE_PREFIX + key
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      return saved === null ? initial : (JSON.parse(saved) as T)
    } catch {
      return initial
    }
  })
  const set = (next: T) => {
    setValue(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Storage blocked: keep it in memory only.
    }
  }
  return [value, set]
}

// ---------------------------------------------------------------------------
// Mock data (local only — no requests, no database)
// ---------------------------------------------------------------------------

interface MockItem {
  id: number
  name: string
  done: boolean
}

const MOCK_ITEMS: MockItem[] = [
  { id: 1, name: 'First mock item', done: false },
  { id: 2, name: 'Second mock item', done: true },
  { id: 3, name: 'Third mock item', done: false },
]

// ---------------------------------------------------------------------------
// Experiments: add yours here
// ---------------------------------------------------------------------------

/** Example experiment: a mock list whose state persists until expiry. Replace or add your own. */
function ExampleExperiment() {
  const [items, setItems] = useSandboxState<MockItem[]>('example-items', MOCK_ITEMS)
  const [draft, setDraft] = useState('')
  return (
    <section style={styles.card}>
      <h2 style={styles.h2}>Example experiment</h2>
      <ul style={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => setItems(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              />{' '}
              {item.name}
            </label>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          setItems([...items, { id: Date.now(), name: draft.trim(), done: false }])
          setDraft('')
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a mock item" style={styles.input} />
        <button type="submit" style={styles.button}>
          Add
        </button>
      </form>
    </section>
  )
}

function Experiments() {
  return (
    <>
      <ExampleExperiment />
    </>
  )
}

// ---------------------------------------------------------------------------
// Shell: countdown, manual reset and the expiry switch
// ---------------------------------------------------------------------------

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s % 60).padStart(2, '0')}s`
}

function Sandbox() {
  const [now, setNow] = useState(() => Date.now())
  /** Bumped by "Reset now" to remount the experiments with fresh state. */
  const [generation, setGeneration] = useState(0)
  const expired = isExpired(now)

  useEffect(() => {
    if (expired) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [expired])

  // Crossing the deadline (or opening the page after it) wipes everything the sandbox stored.
  useEffect(() => {
    if (expired) wipeSandboxStorage()
  }, [expired])

  if (expired) {
    return (
      <main style={styles.page}>
        <h1 style={styles.h1}>Sandbox expired</h1>
        <p style={styles.muted}>
          It expired at {EXPIRES_AT.toLocaleString()}. Its experiments no longer run and everything they saved has been
          cleared. To keep experimenting, move <code>EXPIRES_AT</code> in <code>src/sandbox/main.tsx</code>.
        </p>
      </main>
    )
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.h1}>Sandbox</h1>
        <span style={styles.badge}>
          Expires {EXPIRES_AT.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {formatLeft(EXPIRES_AT.getTime() - now)} left
        </span>
        <button
          type="button"
          style={styles.button}
          onClick={() => {
            wipeSandboxStorage()
            setGeneration(generation + 1)
          }}
        >
          Reset now
        </button>
      </header>
      <p style={styles.muted}>Isolated from the app: no shared code, state, auth or data. Development only.</p>
      <Experiments key={generation} />
    </main>
  )
}

const styles = {
  page: { maxWidth: 760, margin: '0 auto', padding: '32px 16px' },
  header: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  h1: { margin: 0, fontSize: 24 },
  h2: { margin: '0 0 8px', fontSize: 17 },
  muted: { color: '#9aa3b8' },
  badge: { padding: '3px 10px', border: '1px solid #f5b94c', borderRadius: 999, color: '#f5b94c', fontSize: 13 },
  card: { marginTop: 16, padding: 16, border: '1px solid #262b3a', borderRadius: 10, background: '#121522' },
  list: { margin: '0 0 12px', paddingLeft: 18 },
  input: { padding: '6px 8px', marginRight: 8, border: '1px solid #343a4f', borderRadius: 6, background: '#0b0d14', color: 'inherit' },
  button: { padding: '6px 12px', border: '1px solid #343a4f', borderRadius: 6, background: '#1c2133', color: 'inherit', cursor: 'pointer' },
} satisfies Record<string, CSSProperties>

createRoot(document.getElementById('sandbox-root')!).render(
  <StrictMode>
    <Sandbox />
  </StrictMode>,
)
