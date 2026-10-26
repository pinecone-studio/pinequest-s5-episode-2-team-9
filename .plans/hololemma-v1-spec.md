# Hololemma v1: Spec (from the interview)


## Context

Hololemma is a public web app: a holographic 3D lab you control with bare hands through a webcam. It is inspired by m2holo.com, but all of it is our own work. The project folder currently contains only `PLAN.md`. This interview settled the open questions in `PLAN.md` and cut v1 to **structure only**: explore, take apart, study and rebuild **two models, a human heart and a robot dog**. The app is deployed publicly on Vercel. Animations (heartbeat, dog walking) move to v2.

## Decisions from the interview

| Topic | Decision |
|---|---|
| Name | **Hololemma** |
| Audience | High-school students (14–18). Cards are clear, 2–4 sentences, plus one fun fact each |
| v1 scope | **Structure only**: Explore, Explode, Study, Assembly. No heartbeat, no dog walking (v2) |
| Explode trigger | **Pinch with both hands near the model and pull them apart**: the model opens in proportion to the distance; pushing the hands together closes it. Also available as a button and in mouse mode |
| Onboarding | **Quick 1-step calibration** (show both open palms, ~3 s). Default pinch thresholds 0.34 / 0.60. Full 3-step calibration in settings |
| No camera / camera denied | **Mouse mode**: the full app with drag-rotate, wheel zoom, click to select, buttons, drag-and-drop assembly |
| Mobile | The landing page works fully. The lab button is replaced by "Open on a laptop with a webcam" + a copy-link button |
| Language | **English always first**; a toggle switches to Mongolian (the choice is remembered in localStorage). I write all Mongolian text; the user reviews it in the built app |
| Start button | EN: a random word on each visit from: Conjure, Summon, Materialize, Manifest, Project, Illuminate, Ignite, Awaken, Unveil, Beam, Phase in, Shimmer, Emerge, Envision, Holo-up. MN: always **"Эхлэх"** |
| Landing | **Deep-space holo**: near-black background, a live 3D hologram in the hero that assembles as you scroll, cyan + violet glow, thin-line HUD details. Motion-rich like m2holo, but a different style. A **model library** of cards (heart, robot dog, room for more) on the landing |
| Routing | `/` landing + library · `/lab/heart` · `/lab/robot-dog`. These are shareable links that skip the landing |
| Heart look | Hologram, tinted by anatomy: oxygen-poor side **blue** (RA, RV, pulmonary trunk/arteries, venae cavae, cardiac veins); oxygen-rich side **red** (LA, LV, aorta, pulmonary veins, coronary arteries); valves **gold/white**; septum and papillary muscles **violet** |
| Heart inside view | **Cut-away slider** in Study: a clipping plane slices the heart open |
| Assembly rules | A wrong-order drop **bounces back with an explanation** |
| Grab feel | **Light momentum** after releasing a rotation (damped) |
| Head-tracked 3D | Included in v1, **off by default** (settings toggle) |
| Quality | **Automatic and invisible**: an fps monitor lowers bloom, DPR and effects when needed. No user setting |
| Sound | **On, no mute button** (the browser tab mute is enough). The AudioContext starts on the Start click |
| Analytics | **Vercel Analytics**, cookieless, custom events only. Never camera data |
| Accounts | None in v1. localStorage only (calibration, language, settings) |
| Priority | Gestures must be **rock-solid** (never drop parts) **and** visuals must be **stunning** |
| Deploy | GitHub + Vercel, free `*.vercel.app` subdomain. The user has both accounts and will log in when asked |

## Model sources (verified during the interview)

### Heart: Human Reference Atlas (HuBMAP), Visible Human **Male**, CC BY 4.0
- `https://cdn.humanatlas.io/digital-objects/ref-organ/heart-male/v1.3/assets/3d-vh-m-heart.glb` (4.0 MB) contains these meshes:
  - left/right atrium, left/right ventricle, interventricular septum
  - mitral, tricuspid, aortic and pulmonary valves
  - 5 papillary muscles
- `https://cdn.humanatlas.io/digital-objects/ref-organ/blood-vasculature-male/latest/assets/3d-vh-m-blood-vasculature.glb` (18 MB) contains the missing vessels:
  - ascending aorta and aortic arch
  - pulmonary trunk and left/right pulmonary arteries
  - 4 pulmonary veins
  - superior and inferior vena cava
  - left and right coronary arteries, plus the diagonal branch
  - great, middle, small and anterior cardiac veins, and the coronary sinus
- **Final heart parts (18):**
  - Chambers (5): RA, LA, RV, LV, septum
  - Valves (4): tricuspid, mitral, pulmonary, aortic
  - Papillary muscles (1 part, 5 meshes)
  - Great vessels (5): aorta + arch, pulmonary trunk + arteries, pulmonary veins, superior vena cava, inferior vena cava
  - Heart's own vessels (3): left coronary artery, right coronary artery, cardiac veins + coronary sinus
  - Chordae tendineae are not in the source; the papillary muscle card mentions them.
- The vessels are **trimmed** near the heart (bounding sphere around the heart, with clean cut caps). Both files come from the same body scan, so they **should** align. The pipeline verifies this and falls back to a stored manual transform.
- The exact attribution and DOI go in `CREDITS.md` and the in-app credits. Confirm the licence statement on the HRA site during the pipeline step.

### Robot dog: Mini Pupper 2 (MangDang), Apache-2.0, presented as "Robot Dog" with credit
- Source: `github.com/mangdangroboticsclub/mini_pupper_ros`
  - meshes: `mini_pupper_description/meshes/mini_pupper_2/*.stl`
  - placement: `urdf/mini_pupper_2/mini_pupper_description.urdf.xacro`
- Meshes:
  - body: base_link, Board_PCB, Board_connectors_1/2, Body_front, Shell_Side, lidar
  - per leg (lf/rf/lb/rb): 1 (hip), 2 (upper), 3 (lower), foot, plus the linkages pf1/pf2 or pb1/pb2
- **Added by us:** 12 servo motors and 1 battery pack, modelled to match the real robot's layout, so the lesson covers power → controller → motors → legs.
- **Assembly units (~20):**
  - frame
  - battery
  - controller board (PCB + connectors; the IMU is explained on its card)
  - LiDAR
  - front body
  - side shells
  - per leg: hip module (hip + hip servo), upper leg module (upper + knee servo + linkages), lower leg + foot
  - Study and Explore still label the individual meshes.
- Apache-2.0: ship the LICENSE/NOTICE text in the credits.

## Stack

- **Core:** Vite + React + TypeScript (strict), @react-three/fiber, drei, @react-three/postprocessing, Zustand, React Router, `motion` (landing animations).
- **Tracking:** @mediapipe/tasks-vision (HandLandmarker + FaceLandmarker), **lazy-loaded only on `/lab/*`** so the landing stays fast.
- **Tooling:** Vitest, ESLint + Prettier, `@vercel/analytics`.
- **Asset scripts:** gltf-transform, `three` STL loading in Node, a small xacro/URDF parser.
- **Fonts:** Inter + JetBrains Mono, both of which cover Mongolian Ө ө Ү ү.
- **Hard boundary:** `src/input/` (camera, tracking, filters, calibration, gestures) imports neither React nor Three.

## Structure (key files)

```
src/
  app/routes.tsx               / , /lab/:modelId
  landing/                     Hero (scroll-assembling holo), Library cards, StartButton (random word), MobileGate
  input/                       camera, handTracker, faceTracker, filters (One Euro), calibration, gestures, gestureEvents
  scene/                       HoloCanvas, HoloMaterial (fresnel, scanlines, flicker, tint, clipping), PostFX, HandCursors, HeadParallax, AutoQuality
  interaction/                 picking, grab/rotate (with momentum), scale, explode controller, mouse controls
  models/
    ModelDefinition.ts         shared schema (PartDef, ModelDefinition; `run` optional for v2)
    registry.ts                library: { id, slug, titleKey, thumbnail, load() } — new models = one entry
    heart/  robotDog/          definitions (parts, groups, dependsOn, hints, tints)
  modes/                       Explore, Explode, Study (+ cut-away), Assembly
  ui/                          side panel, parts tree, dwell buttons, settings (recalibrate, head-3D, language), credits, debug overlay (D), dev tuning panel
  audio/                       WebAudio synth: click, snap, wrong, success
  i18n/en.json  i18n/mn.json
scripts/
  inspect-glb.ts  build-heart.ts (download → pick nodes → trim → align → simplify → meshopt)
  build-dog.ts   (URDF → place STLs → name nodes → add servos/battery → GLB)
public/models/heart.glb  public/models/robot-dog.glb
CREDITS.md  PROGRESS.md  README.md
```

## Gestures (v1)

| Gesture | Action |
|---|---|
| Point (index extended) | hover highlight + label |
| Pinch ≥ 80 ms (grab < 0.34, release > 0.60, palm-normalized, hysteresis) | grab a part / the model |
| Pinch + move | move a part / rotate the model (momentum on release) |
| Two-hand pinch, hands **not** near the model | scale |
| **Two-hand pinch near the model + pull apart / push together** | **explode / collapse** (continuous) |
| Hold a part + the other hand pinches and pulls away | open Study |
| Fist held 1 s | back / close |
| Hover 600 ms on a HUD button | press |

Robustness:
- One Euro filter on every landmark.
- Stable hand identity (matched by wrist position).
- A state machine per hand.
- Fingertip cursors with a pinch-fill ring.
- Debug overlay (`D` key).
- Dev panel for live tuning of every threshold.
- Unit tests for every gesture.

## Phases

Each phase ends with:
- run it and verify it
- commit
- push → Vercel preview
- update `PROGRESS.md`
- a webcam test checklist for the user
- **wait for feedback**

| # | Phase | Acceptance |
|---|---|---|
| 0 | Scaffold, routes, i18n, `git init`, GitHub repo, Vercel project (user logs in) | Preview URL shows a hologram cube over the mirrored webcam on `/lab/test` |
| 1 | Tracking + quick calibration + cursors + debug overlay | Both hands ≥ 30 fps; steady pinch; calibration survives a reload |
| 2 | Gesture engine, grab/rotate/scale/momentum, explode controller, mouse mode, dev panel, tests | 30 s of play with no accidental drops; tests pass; mouse mode works with no camera |
| 3 | Asset pipeline: `build-heart.ts`, `build-dog.ts`, credits | Both GLBs load with all named parts; heart vessels aligned; each GLB < 3 MB |
| 4 | Explore / Explode / Study on both models, heart cut-away, tints | Every part labelled, explodable and openable in Study; no model-specific code in the modes |
| 5 | Assembly on both models (bench arc, ghost slots, snap, bounce + hint, hint/auto-place, celebration) | Both models can be rebuilt fully by hand and with the mouse |
| 6 | Content: EN + MN cards, hints, UI copy (high-school level; anatomy facts double-checked) | Every key exists in both languages; toggle works everywhere |
| 7 | Landing: deep-space hero with scroll assembly, library, random Start word, mobile gate | Lighthouse perf ≥ 85 on the landing; mobile shows the gate correctly |
| 8 | Head-3D toggle, auto-quality, sounds, analytics events, final visual polish, production deploy | ≥ 30 fps on integrated graphics; clean first run: landing → camera → calibration → model |

**v2 (later):** heartbeat with valve timing and blood-flow particles; dog gaits with IK and X-ray; more library models; accounts.

## Risks to watch

1. Heart and vessel alignment across the two atlas files. Check by overlaying them; fallback is a manual transform.
2. Vessel trimming must look clean (cap the cuts).
3. Pinch-pull explode vs two-hand scale conflict. Resolved by the "near the model" rule; the radius is tunable.
4. Integrated graphics with MediaPipe + bloom: auto-quality, half-resolution bloom, lab-only loading.
5. Mongolian anatomy terms need the user's review.
6. Dog servo/battery models must match the real layout. Check against Mini Pupper docs and photos.

## Verification

- `npm run test`: gesture state machines, filters, calibration math, assembly dependency rules, i18n key parity (en ↔ mn).
- `npm run build` + `npm run preview`. Check the pages in Chrome via the Claude-in-Chrome tools: landing, both lab routes in **mouse mode**, console errors, fps readout.
- `scripts/inspect-glb.ts` on both built GLBs: confirms the part names and sizes.
- Webcam behaviour cannot be tested from here, so each phase ends with a short checklist for the user to test on their laptop.
- Vercel preview URL after every phase; production deploy at the end of Phase 8.
