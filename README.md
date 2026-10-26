# Hololemma

A holographic 3D lab you control with your bare hands through an ordinary webcam. Take a human heart and a robot dog apart in mid-air, study every piece, then put them back together.

- Spec: [`.plans/hololemma-v1-spec.md`](.plans/hololemma-v1-spec.md) · detailed design: [`PLAN.md`](PLAN.md) · status: [`PROGRESS.md`](PROGRESS.md) · licences: [`CREDITS.md`](CREDITS.md)
- Privacy: all camera processing happens in the browser. Video is never uploaded, stored or logged.

## Develop

```bash
npm install
npm run dev        # http://localhost:5173  (/lab/heart, /lab/robot-dog)
npm test           # unit tests (Vitest)
npm run build      # type-check + production build
npm run lint       # oxlint
npm run format     # prettier
```

Desktop Chrome or Edge with a webcam. Without a camera the lab falls back to mouse mode.

Debug: `D` toggles the hand-tracking overlay, `` ` `` the gesture tuning panel, `?fx=0` disables post effects.

## Models

Built once with the asset scripts and committed to `public/models/`:

```bash
npx tsx scripts/build-heart.ts   # Human Reference Atlas heart + vessels (CC BY 4.0)
npx tsx scripts/build-dog.ts     # Mini Pupper 2 CAD (Apache-2.0) + modelled servos/battery
npx tsx scripts/inspect-glb.ts public/models/heart.glb
```

A new model = a GLB, a definition in `src/models/<name>/definition.ts`, an entry in `src/models/registry.ts`, and its texts in `src/i18n/*.json` (a test checks every key).

## Layout

```
src/
  app/        routes (/, /lab/:modelId)
  landing/    landing page, random Start word
  lab/        lab page, panels, calibration, settings, tips
  input/      camera, hand/face tracking, filters, calibration, gestures — no React/Three imports
  interaction/ pointer hub (hands + mouse + dwell), interaction controller
  models/     schema, registry, heart + robot dog definitions
  scene/      R3F canvas, hologram material, model rig, post effects, head parallax, auto quality
  audio/      synthesized sounds
  ui/         HUD components
  i18n/       en.json, mn.json (keys must match; a test enforces it)
```
