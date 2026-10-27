# Hologemma

A holographic 3D lab you control with your bare hands through an ordinary webcam. Take a human heart and a robot dog apart in mid-air, study every piece, then put them back together.

- Spec: [`.plans/hologemma-v1-spec.md`](.plans/hologemma-v1-spec.md) · detailed design: [`PLAN.md`](PLAN.md) · status: [`PROGRESS.md`](PROGRESS.md) · licences: [`CREDITS.md`](CREDITS.md)
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

## Accounts (Firebase Auth)

The lab requires an account (Google or email + password). The landing page stays public.

1. Copy `.env.example` to `.env.local` and fill in the Firebase web app config (Firebase console → Project settings → Your apps).
2. In the Firebase console, enable the **Google** and **Email/Password** sign-in providers, and add the deploy domain (`hologemma.vercel.app`) under Authentication → Settings → Authorized domains.
3. On Vercel, add the same `VITE_FIREBASE_*` variables (Production and Preview).

Without the config, `/login` shows a "not set up" notice and the lab stays locked. Code: `src/auth/`.

**Saved progress (Firestore).** Signed-in users get a profile (`users/{uid}`) and per-model progress (`users/{uid}/progress/{modelId}`: parts studied, assemblies completed, best assembly time). It shows on the library cards, as checkmarks in the lab's part list, and on `/profile`. Create the Firestore database in the Firebase console, then paste [`firestore.rules`](firestore.rules) into Firestore → Rules and publish (each user can only read and write their own documents). Code: `src/progress/`.

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
