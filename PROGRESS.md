# Progress

## Phase 0: Setup ✅ (2026-10-27)

- Vite + React 19 + TypeScript (strict), R3F, drei, postprocessing, Zustand, React Router, Vitest, Prettier.
- Lint uses **oxlint** (the current Vite template default) instead of ESLint.
- Routes: `/` (placeholder landing with a random Start word) and `/lab/:modelId` (lazy-loaded).
- i18n: EN default plus a Mongolian toggle, remembered in localStorage. A test checks that both files have the same keys.
- Camera layer (`src/input/camera.ts`): the video is mirrored, darkened and desaturated. Without a camera, the page falls back to a mouse-mode notice, with the reason.
- Hologram material (fresnel rim, scanlines, flicker, additive) and post effects (bloom, light chromatic aberration, vignette).
- `/lab/test`: a rotating hologram cube over the webcam.
- Vercel SPA rewrites (`vercel.json`).

### Known issues / notes
- No film-grain pass: over a transparent canvas it drew grey noise wherever the bloom spread.
- The lab chunk is ~1 MB (~266 KB gzipped, mostly three.js). It loads only on `/lab/*`.

## Next: Phase 1, hand tracking + quick calibration
