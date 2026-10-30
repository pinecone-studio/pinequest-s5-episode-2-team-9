# Hologemma

A holographic 3D lab you control with your bare hands through an ordinary webcam. Take a human heart and a robot dog apart in mid-air, study every piece, then put them back together.

- Spec: [`.plans/hologemma-v1-spec.md`](.plans/hologemma-v1-spec.md) · detailed design: [`PLAN.md`](PLAN.md) · status: [`PROGRESS.md`](PROGRESS.md) · licences: [`CREDITS.md`](CREDITS.md)
- Privacy: all camera processing happens in the browser. Video is never uploaded, stored or logged.

## The AI tutor: Gemma, taught by Claude

Students can ask "Ask Hologemma" about the heart or computer part they are studying or fitting, in English or Mongolian. To get a small, open model that behaves like a patient teacher, we use **knowledge distillation**: a large model (Claude Opus) writes the lessons, and a small model (Gemma 3 4B) learns from them.

1. **Facts.** We wrote what each part connects to and what can go wrong with it ([`knowledge.ts`](api/_lib/tutor/knowledge.ts)), alongside the lab's study cards.
2. **Distillation.** Claude reads the exact prompt the tutor gets in the app and writes realistic student questions with ideal answers, for every part, in both languages. Examples include misspelled teenage questions, assembly help, off-topic requests the tutor should decline, and questions the facts can't answer, where it should admit it isn't sure.
3. **Fine-tuning.** We use QLoRA with Unsloth: Gemma is loaded in 4-bit to fit on a free Kaggle GPU, its original weights stay frozen, and small LoRA adapters (rank 16) learn the new behaviour. Loss is measured only on the tutor's answers, so the model learns how to respond rather than how to repeat the prompt.
4. **Grounding.** The model doesn't have to memorize every fact. Each request includes the selected part's facts, built by the same [`systemPrompt()`](api/_lib/tutor/prompt.ts) used for the training data, so the model sees the same format in training and in the app. Fine-tuning teaches it to stay within those facts, answer briefly, and never diagnose.
5. **Evaluation.** Held-out questions go to the same model with its adapters off (base) and on (tuned). Claude then grades each answer without being told which model wrote it, scoring factual grounding, language and rule-following.

The merged model is built to run on a Hugging Face Inference Endpoint, with a GGUF copy as an offline backup. Until `TUTOR_ENDPOINT_URL` is set, [`/api/ask`](api/ask.ts) answers with Gemini Flash-Lite using the same prompt. Full steps: [`training/README.md`](training/README.md).

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
npx tsx scripts/build-lungs.ts   # Human Reference Atlas lungs + bronchi + vessels, modelled trachea + diaphragm (~3 min)
npx tsx scripts/build-dog.ts     # Mini Pupper 2 CAD (Apache-2.0) + modelled servos/battery
npx tsx scripts/inspect-glb.ts public/models/heart.glb
```

A new model = a GLB, a definition in `src/models/<name>/definition.ts`, an entry in `src/models/registry.ts`, and its texts in `src/i18n/*.json` (a test checks every key). A part can list `pieces` (see `PieceDef`): smaller structures it splits into in Study, nested to any depth (GLB nodes `<parent>__<piece>`), with texts `<model>.piece.<id>` / `.desc`. The lungs go lung → lobe → segment → lobule. Its guided tour is a step list in `src/models/<name>/tour.ts` (each step can pick a part to face and highlight, an explode or cut-away amount, or the model's motion) plus `<model>.tour.<step>.title` / `.text` texts.

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
  solar/      solar system: real Sun, planet and Moon positions for any date, panel, controls
  atoms/      atom builder, orbitals, double-slit and spin experiments, spectrum
```
