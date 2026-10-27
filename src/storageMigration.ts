// The app was renamed from Hololemma to Hologemma, and its localStorage keys with
// it. Copies each old value to its new key once, so saved language, calibration,
// tuning and lab settings survive the rename. Imported first in main.tsx, before
// any store reads its key.
const KEYS = ['lang', 'lab', 'calibration', 'tuning']

try {
  for (const key of KEYS) {
    const old = `hololemma.${key}`
    const value = localStorage.getItem(old)
    if (value !== null && localStorage.getItem(`hologemma.${key}`) === null) localStorage.setItem(`hologemma.${key}`, value)
    localStorage.removeItem(old)
  }
} catch {
  // Storage blocked (private mode, disabled site data): nothing to carry over.
}
