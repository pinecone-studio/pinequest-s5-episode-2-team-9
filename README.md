# Hololemma

A holographic 3D lab you control with your bare hands through an ordinary webcam. Take a human heart and a robot dog apart in mid-air, study every piece, then put them back together.

- Spec: [`.plans/hololemma-v1-spec.md`](.plans/hololemma-v1-spec.md) · detailed design: [`PLAN.md`](PLAN.md) · status: [`PROGRESS.md`](PROGRESS.md) · licences: [`CREDITS.md`](CREDITS.md)
- Privacy: all camera processing happens in the browser. Video is never uploaded, stored or logged.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173  (lab test scene: /lab/test)
npm test           # unit tests (Vitest)
npm run build      # type-check + production build
npm run lint       # oxlint
npm run format     # prettier
```

Desktop Chrome or Edge with a webcam. Without a camera the lab falls back to mouse mode.

## Layout

```
src/
  app/        routes (/, /lab/:modelId)
  landing/    landing page, random Start word
  lab/        lab page (camera + 3D)
  input/      camera, tracking, gestures — no React/Three imports
  scene/      R3F canvas, hologram material, post effects
  ui/         HUD components
  i18n/       en.json, mn.json (keys must match; a test enforces it)
```
