# How Hologemma Was Built

A technical walkthrough of the Hologemma codebase: what each part does, why it is built that way, and how the pieces connect. Written for engineers who need to understand the system well enough to explain it to others, extend it, or debug it.

Status of the facts in this document: everything was checked against the repository at `main` (commit `03a7df9`). Test, type-check and build results are from a local run on the same commit. Where a planning document disagrees with the code, the code is treated as the truth and the disagreement is listed in [§13](#13-known-discrepancies-in-the-docs).

---

## Contents

1. [What it is](#1-what-it-is)
2. [Tech stack at a glance](#2-tech-stack-at-a-glance)
3. [Repository layout](#3-repository-layout)
4. [Architecture overview](#4-architecture-overview)
5. [Input: from webcam to gesture events](#5-input-from-webcam-to-gesture-events)
6. [Interaction: from hands and mouse to model actions](#6-interaction-from-hands-and-mouse-to-model-actions)
7. [Rendering: the hologram](#7-rendering-the-hologram)
8. [The model system: one schema, many models](#8-the-model-system-one-schema-many-models)
9. [Asset pipeline: how the 3D models were made](#9-asset-pipeline-how-the-3d-models-were-made)
10. [Motion, the atoms lab, and the landing page](#10-motion-the-atoms-lab-and-the-landing-page)
11. [Cross-cutting: state, i18n, audio, analytics, privacy](#11-cross-cutting-state-i18n-audio-analytics-privacy)
12. [Build, test, deploy, and how to reproduce](#12-build-test-deploy-and-how-to-reproduce)
13. [Known discrepancies in the docs](#13-known-discrepancies-in-the-docs)
14. [How to add a new model](#14-how-to-add-a-new-model)
15. [Development history](#15-development-history)
16. [Glossary](#16-glossary)

---

## 1. What it is

Hologemma is a browser app. A user opens it, allows webcam access, and sees their own mirrored video with 3D objects drawn on top. Those objects (a human heart, a robot dog, a brain, a skeleton, muscles, a rocket engine, an electric motor, and an atoms lab) can be controlled with bare hands:

- Pinch and rotate the model.
- Pull two pinched hands apart to explode it into parts.
- Pinch one part out and pull it into a study view.
- Put the parts back together in an assembly mode.

Two design rules shape almost everything else:

- **Privacy by construction.** Video is processed in the browser by MediaPipe. Frames are never uploaded, stored or logged. The only analytics are cookieless custom events with names such as `explode` or `assembly_complete`.
- **Mouse fallback everywhere.** Without a camera, or with the camera denied, every action also works with the mouse and keyboard.

The app is deployed to Vercel as a static Vite build. Vercel rewrites every path to `index.html`, so the React Router routes work on refresh.

---

## 2. Tech stack at a glance

| Layer | Choice | Where it lives |
|---|---|---|
| Build and dev server | Vite 8, TypeScript 6 (strict) | `vite.config.ts`, `tsconfig*.json` |
| UI | React 19, React Router 8 | `src/main.tsx`, `src/app/routes.tsx` |
| 3D | three.js 0.186, React Three Fiber 9, drei 10 | `src/scene/` |
| Post-processing | `@react-three/postprocessing` (bloom, chromatic aberration, vignette) | `src/scene/PostFX.tsx` |
| Hand and face tracking | `@mediapipe/tasks-vision` (HandLandmarker, FaceLandmarker), self-hosted | `src/input/`, `scripts/sync-mediapipe.mjs` |
| Mesh picking | `three-mesh-bvh` (BVH-accelerated raycasts) | `src/scene/modelRig.ts` |
| State | Zustand 5 (with `persist` for saved preferences) | `src/lab/*Store.ts`, `src/i18n/index.ts` |
| Landing animations | `motion` (Framer Motion's successor package) | `src/landing/` |
| Sound | Web Audio API, all sounds synthesised in code | `src/audio/sfx.ts` |
| Analytics | `@vercel/analytics` (cookieless) | `src/analytics.ts` |
| Fonts | Inter and JetBrains Mono, self-hosted via `@fontsource-variable/*` | `src/main.tsx` |
| Tests | Vitest 5 | `vitest.config.ts`, `*.test.ts` |
| Lint | oxlint | `.oxlintrc.json` |
| Format | Prettier | `.prettierrc.json` |
| Asset build | Node + `tsx`, `@gltf-transform/*`, `meshoptimizer`, `three` (geometry only), `fast-xml-parser` | `scripts/` |
| Hosting | Vercel (SPA rewrite in `vercel.json`) | `vercel.json` |

---

## 3. Repository layout

```
src/
  main.tsx              entry: fonts, CSS, analytics, router
  app/routes.tsx        "/" landing; "/lab/:modelId" lab (lazy); phones get MobileGate
  landing/              landing page, 3D hero, model cards, random start word
  lab/                  lab page, panels, calibration overlay, settings, stores
  input/                camera, hand + face tracking, filters, calibration, gestures
                        (framework-free: no React or three imports)
  interaction/          pointer hub (hands + mouse), interaction controller
  models/               ModelDefinition schema, registry, one folder per model
  scene/                R3F canvas, hologram material, rig, post-FX, quality governor
    motion/             per-model animation (heartbeat, gait, rotor, rocket)
  atoms/                the atoms & quantum lab (its own scenes and maths)
  audio/                Web Audio synthesiser
  ui/                   small shared UI pieces (language toggle, device check)
  i18n/                 en.json, mn.json, store
scripts/                asset pipeline (Node): build-*.ts, lib/, blender/
public/
  models/*.glb          built 3D models, committed
  mediapipe/            generated at install/build time (git-ignored)
  licenses/             Apache-2.0 text and NOTICE for the robot dog
.plans/                 interview spec v1, spec v2
PLAN.md  PROGRESS.md  README.md  CREDITS.md
```

The hard boundary is `src/input/`. It must not import React or three.js. This keeps the gesture logic unit-testable in Node and reusable, and it is the reason the gesture tests need no DOM.

---

## 4. Architecture overview

```
 Webcam (getUserMedia, 1280x720 @30)
        │
        ▼
 <video> (hidden, mirrored display)  ──►  HandTracker (MediaPipe, GPU→CPU)
                                              │  raw landmarks, ~30 Hz
                                              ▼
                                    HandTracks  (stable IDs, One Euro filter,
                                              │   pose: pinch ratio, curls, fist)
                                              ▼
                                    GestureMachine per hand
                                              │  pinchStart / pinchEnd / fistHold
                                              ▼
 ┌──────────────── HandInput (src/input/handInput.ts) ─────────────────┐
 │ latest snapshot (read every render frame) + gesture event stream    │
 └──────────────┬───────────────────────────────────────┬──────────────┘
                ▼                                        ▼
        PointerHub (hands + mouse)               HandLayer (2D canvas,
        dwell-to-press on HUD, pointers    ──►   cursors, pinch ring)
                │
                ▼
   InteractionController (rotate, drag part, carry, explode, scale, study)
                │  writes targets into
                ▼
   Zustand stores (useModel, useLab, useAtoms)
                │  read by
                ▼
   ModelRig (three.js, per frame: eases every part toward its target)
                │  + RigMotion (heart/motor/rocket/dog layer)
                ▼
   R3F Canvas: HoloMaterial or PBR material → PostFX → screen
   (transparent canvas drawn over the mirrored video)
```

Two loops run at different rates, and this separation is deliberate:

- **Tracking loop** runs on each new video frame (`requestVideoFrameCallback`), about 30 Hz. It produces new landmarks and gesture events.
- **Render loop** runs at the display rate (three.js `useFrame`). It reads the latest hand snapshot, moves the cursors, and eases the 3D parts toward their targets.

Because the render loop reads the latest snapshot instead of waiting for tracking, the picture stays smooth even when detection is slower than the screen.

---

## 5. Input: from webcam to gesture events

All of this lives in `src/input/` and has no framework dependencies.

### 5.1 Camera (`camera.ts`)

`startCamera()` asks for a 1280×720 user-facing video stream at 30 fps. Errors are classified into four kinds (`denied`, `notFound`, `unsupported`, `unknown`) so the UI can show a specific message. Each kind leads to mouse mode. The video element is muted and set to `playsInline`, and the stream never leaves the page.

### 5.2 Hand tracking (`handTracker.ts`)

- MediaPipe `HandLandmarker` is created with `runningMode: 'VIDEO'`, 2 hands, and these confidence thresholds: detection 0.6, presence 0.6, tracking 0.5.
- It tries the **GPU delegate first** and falls back to **CPU** if creation fails. The chosen delegate is exposed as `delegate` and shown in the debug overlay.
- The WASM runtime and model files are served from `/mediapipe/`. `scripts/sync-mediapipe.mjs` copies the WASM from `node_modules` and downloads the two `.task` model files from Google storage into `public/mediapipe/` before `dev` and `build`. The directory is git-ignored, so the repository stays small and nothing is fetched from a third party at runtime.
- Frames are processed in a `requestVideoFrameCallback` loop. MediaPipe needs strictly increasing timestamps, so the code uses `max(performance.now(), last + 1)`.
- Each detection is mapped to a `RawHandFrame`: 21 landmarks per hand in normalized video coordinates, plus handedness and a score.

### 5.3 Stable hand tracks (`handTracks.ts`)

MediaPipe does not give a persistent identity to each hand, and its handedness label can flip. `HandTracks` builds that identity:

- Hands with a score below `minHandScore` (0.6) are dropped.
- Each new detection is matched to an existing track by **wrist position** (greedy nearest-neighbour, with a maximum jump of `trackMatchDistance` = 0.25). Two hands is the maximum, so greedy matching is effectively optimal.
- A track that loses its detection keeps **coasting** for `lostGraceMs` (220 ms). During coasting, gesture state is frozen, so one missed frame never drops a part.
- Landmarks are smoothed with a **One Euro filter** (see 5.4) before any measurement.

### 5.4 One Euro filter (`filters.ts`)

The One Euro filter (Casiez et al., 2012) is a low-pass filter whose cutoff frequency rises with speed:

- `minCutoff` (1.2 Hz): smoothing when the hand is still. Lower is steadier.
- `beta` (8): how strongly speed opens the cutoff. Higher means less lag during fast movement.
- `dCutoff` (1 Hz): cutoff for the speed estimate itself.

Each landmark coordinate has its own filter (`PointsFilter` holds 63 `OneEuroFilter`s for 21 points × 3 axes). The parameters are the first things to tune with the dev panel (`` ` ``).

### 5.5 Geometry and pose (`handGeometry.ts`)

All measurements are normalized by **palm size** (wrist to middle-finger knuckle), so a gesture works at any distance from the camera.

| Measurement | Definition | Typical values |
|---|---|---|
| `pinch` | distance(thumb tip, index tip) ÷ palm size | ≈ 0.15 touching, ≈ 1.1 wide open |
| `curls[i]` | sum of the three joint bends of finger *i* (in degrees) | straight ≈ 0, fist > 150 per finger |
| `openPalm` | all four fingers extended, thumb out, pinch > 0.5 | |
| `fist` | every finger curl > `fistMinCurl` (150) | |
| `pointing` | index extended, the other three curled | |

Note that the isotropic correction matters. `toIsotropic()` scales x and z by the video aspect ratio before measuring distances, so a 16:9 frame does not distort angles and lengths.

### 5.6 Calibration (`calibration.ts`)

Calibration turns the raw pinch ratio into two personal thresholds: **grab** (pinch closes below it) and **release** (pinch opens above it). The gap between them is hysteresis, which stops a held part from flickering in and out.

- **Defaults:** grab 0.34, release 0.60 (taken from the reference product that inspired the project).
- **Quick calibration** (first visit): hold open palms for 1.5 s to record the palm size.
- **Full calibration** (Settings → Recalibrate): open palms (1.5 s), then pinch three times (records closed and open ratios), then make a fist (0.6 s).
- The pinch step derives the thresholds with `thresholdsFromPinch(closed, open)`:
  - `grab = closed + 0.18 × range`
  - `release = closed + 0.42 × range`
  - It falls back to the defaults if the range is under 0.4 or the closed value is above 0.45 (implausible samples).
- The result is saved to `localStorage` under `hologemma.calibration`. It is rejected on load if `grab >= release` or the version differs.

### 5.7 Gesture state machine (`gestures.ts`)

Each hand has one `GestureMachine` with four phases:

```
            ratio < grab                    held ≥ pinchHoldMs (80 ms)
   open ───────────────────► pending ──────────────────────────► pinched
    ▲                          │ ratio > release or can't pinch     │  ratio > release
    │◄─────────────────────────┘                                    ▼
    │                                                           releasing
    │       held ≥ releaseHoldMs (60 ms) with ratio > release       │
    └────────────────────────────────────────────────────────────────┘
                                 (ratio back ≤ release → pinched again)
```

Rules that matter:

- **Hold times** stop single-frame noise from triggering a grab (80 ms in, 60 ms out).
- **A fist never starts a pinch.** `canPinch` is false while the hand is a fist or an open palm, and a pinch with the index finger too curled (≥ 175°) is not a pinch.
- **A fist held 300 ms while pinched releases the pinch.** This gives a deliberate "drop" gesture.
- **A fist held 1000 ms** emits `fistHold` once, which the UI maps to "back".
- **Losing the hand** (`lose()`) ends any pinch with `cancelled: true`, so nothing is stuck in the held state.
- The machine exposes `pinchProgress` (0–1) for the cursor ring. In the pending phase the ring fills from 0.6 to 1.0 over the hold time, so the user sees the pinch registering.

The gesture tests (`gestures.test.ts`) drive this machine with synthetic hand tracks and check each transition.

### 5.8 Hand input facade (`handInput.ts`)

`HandInput` owns the tracker, tracks and machines. It is the only object the UI talks to. It exposes:

- `latest`: the latest `HandsSnapshot`, read every render frame (no re-render storm from React).
- `subscribe(listener)`: called with each snapshot and the gesture events it produced.
- `startCalibration(mode)`, `onCalibration(listener)`: drive the calibration overlay.
- `trackingFps`: detection rate over the last second, shown in the debug overlay.

Each `HandState` carries both normalized landmarks and **screen-pixel** landmarks (mirrored and cover-cropped through `coords.ts`), so cursors line up with what the user sees.

---

## 6. Interaction: from hands and mouse to model actions

### 6.1 Pointer hub (`interaction/pointerHub.ts`)

The hub turns hands and the mouse into one kind of pointer:

- A hand pointer's position follows the **pinch point** (the midpoint of thumb and index tips), and `pressed` means "pinched".
- A mouse pointer is pressed while the button is held.
- **HUD elements** (anything marked `data-hud`, buttons, links, range sliders) get first claim on a press. A press that lands on HUD is marked `captured` and never reaches the 3D scene.
- **Dwell-to-press:** a hand hovering over a HUD control for `dwellMs` (600 ms) presses it. A ring fills while the hover continues, so tired arms can still use the menus.
- Everything else is delivered to the scene as `down`, `move`, `up`, `cancel`, `wheel`, `fist` or `doubleclick` events.

### 6.2 Interaction controller (`interaction/controller.ts`)

The controller turns hub events into gestures. It works with two kinds of gesture state:

| Gesture | Trigger | Result |
|---|---|---|
| **Rotate** | one pointer dragged on empty space | rotates the model; releasing keeps a little damped momentum |
| **Drag part** | one pointer pressed on a part (explode view) | moves that part with the pointer (`partDrag`) |
| **Tap to select** | press and release within 10 px and 400 ms | selects the part under the pointer |
| **Carry** | one pointer on a part in assembly mode | the part follows the pointer; on release it is placed or bounces back |
| **Explode** | two pinched hands starting **near** the model (within `explodeNearRadius` model radii) | explode amount follows the change in hand distance, scaled by `explodeGain`; pushing together collapses |
| **Scale** | two pinched hands starting **away** from the model | zoom |
| **Stretch to study** | one hand holds a part, the other pinches and pulls away past 1.35× the starting distance | opens Study on that part |

The explode-versus-scale split is decided once, at the start of the two-hand gesture, by distance to the model. That avoids the two actions fighting each other.

The controller also handles mouse equivalents: drag to rotate, wheel to zoom, and click to select. The hub reports double-clicks, but this document does not confirm what the controller does with them.

---

## 7. Rendering: the hologram

### 7.1 The canvas (`scene/HoloCanvas.tsx`)

- A React Three Fiber `<Canvas>` with `alpha: true` and a transparent clear colour. It is laid over the mirrored `<video>`, so the webcam image shows through everywhere except where the model is drawn.
- Camera at z = 3.2, field of view 45°.
- Device pixel ratio is `[1, 2]`, and the quality governor can lower it (see 7.5).
- `gl.localClippingEnabled = true`. This lets the cut-away slider use plane clipping.

### 7.2 The hologram shader (`scene/HoloMaterial.ts`)

This is a hand-written GLSL `ShaderMaterial`. It produces the look without any textures:

1. **Fresnel rim.** `facing = |n · v|` (normal dot view direction). The rim term is `(1 − facing)^power`, so edges glow and faces stay dim.
2. **Body fill.** `body = fill + rim × (1 − fill)`. The `fill` uniform sets how solid the part looks.
3. **Scanlines.** `sin(worldY × density − time × 2)`, smoothed into a 0.78–1.0 band. The bands drift upward over time.
4. **Flicker.** A very small sinusoidal brightness wobble at 23 Hz and 7.3 Hz.
5. **Colour and highlight.** `uColor` is scaled by the rim and intensity. The `uHighlight` uniform brightens a selected part, and above 1.0 it mixes towards white.
6. **Output.** `gl_FragColor = colour × alpha` with additive blending and `depthWrite: false`, so overlapping parts glow together instead of occluding each other.

Two safety details are commented in the code. Zero-length normals are replaced with the view direction, because a single NaN gets smeared across the screen by the bloom pass. Back faces flip the normal, so the inside of an opened heart still looks right.

### 7.3 The realistic view (`scene/realisticLooks.ts`)

Each model can switch between Hologram and Realistic (`viewStyle` in the lab store). Realistic uses `MeshPhysicalMaterial` presets with values such as `roughness`, `clearcoat`, `sheen` (for velvety tissue), `metalness` (for metal parts), `emissive` (for hot metal) and `opacity` (for fluids). Each part's look is resolved from its own id, then its `info` id, then its group, then the model's `default` (see `lookFor()` in `ModelDefinition.ts`).

Studio lighting is set up in `StudioLights.tsx` and `studioEnvironment.ts`.

### 7.4 Post-processing (`scene/PostFX.tsx`)

`EffectComposer` with 4× multisampling, because it renders to its own buffer and the canvas's `antialias` flag does not reach it. That flag only covers direct rendering (quality level 0 and `?fx=0`). Effects differ by view:

- **Hologram:** Bloom (intensity 1.1, luminance threshold 0.15, radius 0.7), chromatic aberration (only at the highest quality level), vignette.
- **Realistic:** a faint bloom (intensity 0.3, threshold 0.95) and a vignette. No aberration, since real objects should not fringe.

The code deliberately has **no film grain**. Over a transparent canvas, grain paints visible grey noise wherever bloom spreads alpha. The scanlines in the hologram shader do that job instead.

Debug switches: `?fx=0` turns all effects off, and `?fx=bloom,ca,vig` picks specific ones.

### 7.5 Automatic quality (`scene/AutoQuality.tsx`, `scene/quality.ts`)

The app has no quality setting. Instead a governor measures frame rate over 1.5 s windows:

| Level | Effects | Device pixel ratio |
|---|---|---|
| 2 (full) | bloom, chromatic aberration, vignette | 1–2 |
| 1 | bloom, vignette | 1 |
| 0 (minimal) | no post-processing at all (`PostFX` returns nothing) | 0.75 |

It steps **down** after two consecutive windows below 42 fps, and steps **up** after six consecutive windows above 57 fps. The asymmetry avoids oscillation: going down is quick, going back up is cautious.

### 7.6 The model rig (`scene/modelRig.ts`, 541 lines)

`ModelRig` is the core of the three.js side. It is plain three.js, with no React inside it. React creates it, calls `update()` each frame, and forwards events.

On construction it walks the loaded GLB and, for each part defined in the model's `parts` list, it:

- finds the mesh by node name,
- creates a hologram material and a PBR material, and an edge overlay for CAD-style models (`edges: true`),
- creates a **ghost** mesh (the faint outline shown in assembly for each empty slot),
- records the part's **home** position and its **explode offset** (from `explodeDir`, scaled by `explodeScale`, or computed from the part's direction away from the model centre),
- records a **bench slot** on the assembly arc, placed in a deterministic order (a hash-based shuffle, so the bench is not laid out in assembly order).

It also builds the BVH for each mesh with `three-mesh-bvh` (`computeBoundsTree` and `acceleratedRaycast`), which keeps picking fast on high-polygon models.

Every frame, `update()` eases each part from its current position and scale toward its **target**. A part's target depends on its location (`model`, `bench`, `carry`) and the mode. The easing is a cubic ease-out, `1 − (1 − t)³`.

Motion modules (`RigMotion`) are layered on top of this base pose after each frame, so a heartbeat or a spinning rotor does not interfere with the explode animation.

### 7.7 The cut-away plane

The heart has a `cutaway` slider. The slider moves a clipping plane through the model. The hologram material is created with `clipping: true` and includes three.js clipping chunks, and the canvas enables local clipping. Only the heart enables the control (`cutaway: true` in its definition).

---

## 8. The model system: one schema, many models

### 8.1 The schema (`models/ModelDefinition.ts`)

Every model is a plain data object of type `ModelDefinition`. The modes (explore, explode, study, assembly) never contain model-specific code. Each one reads only this data:

- `id`, `slug` (URL: `/lab/<slug>`), `url` (the GLB in `public/`)
- `groups`: the categories shown in the panel
- `parts`: a list of `PartDef`, one per GLB node:
  - `id` is the GLB node name, and `group`, `color` (hologram tint) and `dependsOn` (assembly prerequisites) are required.
  - optional `info` (share a card with another part), `hint` (share a wrong-order hint), `explodeScale` and `explodeDir` (tune the explode).
- `baseParts`: parts that start in place during assembly (such as the heart's septum)
- `cutaway`, `edges`, `glow`: rendering switches
- `initialRotation`: the first view angle
- `motion`: `'heart' | 'motor' | 'rocket' | 'dog'`, if the model can animate
- `looks`: the Realistic material for each part, with a `default`
- `sources`: the credit lines shown in the Credits panel

Three helper functions are defined next to it:

- `assemblyOrder(def)`: a topological sort over `dependsOn`. It throws on a cycle, and a test checks that no model has one.
- `placeable(def, placed)`: the parts that may be placed right now, which drives the "wrong order" check.
- `lookFor(def, part)`: the Realistic-material lookup chain described in 7.3.

### 8.2 The registry (`models/registry.ts`)

`library` is the ordered list of models shown on the landing page. `experiences` lists labs that are not take-apart models (currently only atoms). `modelBySlug` and `experienceBySlug` resolve the URL.

### 8.3 Translation keys

Keys are generated from the definition (`keys.partName`, `keys.partDesc`, `keys.partFact`, `keys.partHint`, and so on). For each part, `en.json` and `mn.json` need entries such as `heart.part.septum`, `heart.info.septum.desc` and `heart.info.septum.fact`. `models.test.ts` checks that every part of every model has its keys, and `i18n.test.ts` checks that the two languages have the same keys.

---

## 9. Asset pipeline: how the 3D models were made

The `public/models/*.glb` files are **built once, offline, and committed**. The app never builds geometry at runtime. Each GLB is produced by a script in `scripts/`, run with `npx tsx`.

### 9.1 The shared writer (`scripts/lib/output.ts`)

Every model passes through `writePartsGlb()`. It takes a list of named parts (world-space triangle soups) and does the following:

1. **Centre** the whole model on its bounding-box origin, and pivot each part at its own centroid.
2. **Weld** duplicate vertices (`weld()`), so the simplifier sees a closed surface.
3. **Simplify** each part to a triangle budget (`maxTriangles`), using `meshoptimizer`'s simplifier with an error bound of 0.01.
4. **Dedupe, prune and reorder** (`dedup`, `prune`, `reorder`). Reordering improves GPU vertex-cache use.
5. **Repair normals.** Zero-length normals are replaced with up, because NaN normals break lighting and bloom (see 7.2).
6. **Compress.** `KHR_mesh_quantization` (16-bit positions and normals) plus `EXT_meshopt_compression` in quantize mode.
7. **Write** the GLB, and print the triangle count and file size.

Every node name is the part id, so the app can find each part by name. That is what the `ModelDefinition` relies on, and a test checks that every part id exists as a node in the GLB.

### 9.2 Human heart (`scripts/build-heart.ts`)

- **Source:** two reference organs from the Human Reference Atlas (HuBMAP), both made from the Visible Human Male. One is the heart and the other is the blood vasculature. Both are CC BY 4.0. The script downloads them from the Atlas CDN into `scripts/.cache/` (git-ignored).
- **Why they line up:** both files share one coordinate frame (metres, +y up, +z anterior), so the vessels fit the heart with no transform. The PLAN required a manual-transform fallback, but the code comments say it is not needed.
- **Parts:** 18 parts are picked by exact atlas node name. Each one has a triangle budget.
- **Trimming:** the long vessels are trimmed with a `minY` cut. Only triangles whose centroid is above that height are kept. This keeps the aorta focused on the heart.
- **Output:** `heart.glb` is about 1.6 MB, with roughly 148k triangles according to PROGRESS.md.

### 9.3 Robot dog (`scripts/build-dog.ts`, `scripts/lib/urdf.ts`)

- **Source:** the Mini Pupper 2 robot from MangDang (Apache-2.0). The script downloads its URDF (an XML robot description) and its STL meshes from GitHub.
- **Parsing:** `urdf.ts` parses the URDF, and `parseBinaryStl` reads the binary STL meshes. `forwardKinematics` places each mesh at its joint origin, so the robot is assembled in its real geometry. Millimetres are converted to metres.
- **Standing pose:** the hip pitch is 0.75 rad and the knee is −1.5 rad, with the feet under the hips.
- **Added by us:** the CAD has no separate servo or battery meshes, so the script models them. Each servo is a box with a round output shaft (`servo()`), and each leg gets three servos (abduction, hip pitch, knee). The battery is one box. These are approximations of the real layout.
- **Output:** `robot-dog.glb`, about 0.94 MB, with 22 named parts.

### 9.4 Skeleton and muscles (`scripts/build-skeleton.ts`, `build-muscles.ts`, `lib/bp3d.ts`)

- **Source:** BodyParts3D (The Database Center for Life Science, CC BY 4.0, version 4.0). It is a set of OBJ meshes, one per anatomical element. Download it into `scripts/.cache/bp3d/`, as CREDITS.md explains.
- **Loader (`bp3d.ts`):** `listElements()` reads each OBJ header for its English name, because file names are IDs. `loadObj()` parses the vertices and faces and converts them to app space. BodyParts3D is in millimetres with z up, and the app uses metres with y up and z towards the viewer.
- **Grouping:** `buildGroups(rules, elements)` assigns elements to groups using regular-expression rules (`SKELETON_RULES` in `lib/skeletonRules.ts`). The skeleton has 34 bone groups for students.
- **Muscles:** `build-muscles.ts` uses the same loader, but its rules are per side (`perSide('left')` and `perSide('right')`) and it excludes non-muscle structures with a regular expression (arteries, veins, nerves, ligaments, tendons, fasciae and so on). It produces 43 parts on a faint skeleton base.
- **Z-Anatomy additions:** some muscles are not in BodyParts3D, including latissimus dorsi, the abdominal muscles, quadratus lumborum, the jaw and the face muscles. They come from Z-Anatomy (CC BY-SA 4.0), which is based on BodyParts3D.
  - `scripts/export-zanatomy.sh` runs Blender 4.2 in background mode with `--disable-autoexec`, so no script embedded in the `.blend` file runs. Only `scripts/blender/export_objects.py` runs, and it writes the requested objects as raw float32 files.
  - Z-Anatomy and BodyParts3D differ slightly in scale and pose, so `lib/zanatomy.ts` applies a per-region affine fit (`fit.json`, one for `head` and one for `trunk`). The fits are computed from bones present in both datasets. The stated accuracy is about 1 mm for the head and about 5 mm for the trunk.
- **Licensing consequence:** because Z-Anatomy is CC BY-SA, `muscles.glb` is distributed under CC BY-SA 4.0. The app code is not affected. CREDITS.md records this.

### 9.5 Brain (`scripts/build-brain.ts`)

- **Source:** the HRA 3D Reference Organ for the brain (CC BY 4.0). It contains 283 structures from the Allen Human Brain Atlas, registered to the Visible Human Male.
- **Grouping:** structures are grouped into 22 parts for students. The forebrain white matter is left out so the lobes and deep structures stay visible.
- **Sides:** the atlas's `_L` and `_R` labels do not match the heart model's frame. The script labels the hemispheres by **position** instead, so left and right agree with the heart.

### 9.6 Rocket engine and electric motor (`scripts/build-rocket.ts`, `build-motor.ts`)

These are **original designs**, modelled in code with three.js geometry (`LatheGeometry` for the nozzle and chamber, `CylinderGeometry`, `TorusGeometry`, `TubeGeometry` for pipes, `ExtrudeGeometry` for the brush holders). `lib/three-mesh.ts` converts these into the same triangle-soup format as the other sources, and then the shared writer takes over.

- **Rocket:** a liquid-fuel gas-generator engine (kerosene and liquid oxygen). The thrust-chamber contour is a function of height: a chamber, a throat, and a nozzle whose wall uses a cosine curve between the throat and the exit. 18 parts.
- **Motor:** a brushed DC motor with the shaft along x and 7 poles (`POLES = 7`). 14 parts.

### 9.7 Inspecting a GLB

`scripts/inspect-glb.ts` prints the node names and sizes of a GLB. The model tests read the GLB JSON chunk directly to confirm that every part id exists as a node.

### 9.8 Model size summary

| File | Size | Parts | Source | Licence |
|---|---|---|---|---|
| `heart.glb` | 1.63 MB | 18 | HRA (HuBMAP) | CC BY 4.0 |
| `brain.glb` | 1.31 MB | 22 | HRA (Allen Brain Atlas) | CC BY 4.0 |
| `skeleton.glb` | 1.26 MB | 34 | BodyParts3D | CC BY 4.0 |
| `muscles.glb` | 2.32 MB | 43 | BodyParts3D + Z-Anatomy | CC BY-SA 4.0 |
| `robot-dog.glb` | 0.94 MB | 22 | Mini Pupper 2 (MangDang) + our servos | Apache-2.0 |
| `rocket-engine.glb` | 0.92 MB | 18 | original, code-modelled | project |
| `electric-motor.glb` | 0.63 MB | 14 | original, code-modelled | project |

Sizes and part counts are from the built files and the model definitions on `main`.

---

## 10. Motion, the atoms lab, and the landing page

### 10.1 Motion modules (`scene/motion/`)

Each motion is opt-in. It plays only after the user presses the model's Play button, and it is layered on the base pose by the rig (see 7.6).

- **Heart (`heartMotion.ts`, `heartClock.ts`, `flow.ts`, `glow.ts`).** A heartbeat clock with a BPM control (40–180). The atria contract first, then the ventricles, and the valves open and close in phase. `flow.ts` draws blood-flow particles along paths built from the heart's own part positions: blue for oxygen-poor blood (vena cava → right atrium → right ventricle → pulmonary trunk), red for oxygen-rich (pulmonary veins → left atrium → left ventricle → aorta). An ECG trace and the lub and dub heart sounds are synthesised too. `glowPart()` brightens a part as it contracts.
- **Robot dog (`dogMotion.ts`).** Each foot follows a step path: it lifts during swing and slides back on the ground during stance. A **two-bone inverse-kinematics** solver (`solveLeg`) turns the foot position into hip and knee angles, with the knee bending backwards as on the real robot. Two gaits are defined by phase offsets and duty factor. **Trot** moves diagonal pairs together (duty 0.55). **Walk** moves one leg at a time (duty 0.75). `dogMotion.test.ts` checks the IK.
- **Motor (`motorMotion.ts`).** The rotor spins, with a speed control in percent.
- **Rocket (`rocketMotion.ts`).** The engine fires, with flame particles from the nozzle.

### 10.2 The atoms & quantum lab (`src/atoms/`)

This is a separate experience (`experiences` in the registry), with its own panel and scenes. It is the most maths-heavy part of the app. The physics is in plain TypeScript and is unit-tested (`atoms.test.ts`).

- **Build (`elements.ts`, `atomStore.ts`).** Protons, neutrons and electrons for the first 20 elements. The store works out the element, the stable isotopes, the ion charge and the periodic-table position. Stability is shown from the nucleus.
- **Hydrogen orbitals (`orbitals.ts`).** The orbital is ψ(n, l, m) = R(n,l)(r) · Y(l,m)(θ, φ) in atomic units (a₀ = 1). The radial part uses a generalized Laguerre polynomial by recurrence, with the standard normalization constant. The angular part uses **real** spherical harmonics, so each lobe has a definite sign (phase) and can be coloured by it.
- **Energy levels and light (`spectrum.ts`).** Photons come from the Rydberg formula, 1/λ = R_H (1/n_low² − 1/n_high²), with R_H = 1.09677583 × 10⁻² nm⁻¹. `band()` classifies the wavelength as ultraviolet, visible or infrared, and the visible wavelength is converted to a display colour.
- **Quantum experiments (`quantumExperiments.ts`).** The double slit uses the far-field intensity: the two-slit interference term multiplied by a single-slit sinc envelope. Turning on the "which-slit" observer removes the interference and leaves two separate bands, which is the wave–particle point. Stern–Gerlach spin setups (z, zz, zx, zxz) sample outcomes from sequential measurements. The test checks the key case: z then z repeats, and z then x is 50/50.
- **Tests** (`atoms.test.ts`) check the Laguerre polynomials, radial normalization, radial node counts, orbital signs, the sampled 1s radius, the Balmer lines, the colours, the atom builder (elements, isotopes, ions, stability, shell filling), and the slit and spin behaviour.

### 10.3 The landing page (`src/landing/`)

- `LandingPage.tsx` uses `motion` for reveal-on-scroll sections, with a `reveal` preset (opacity and y-offset, eased with a cubic-bezier) that runs once when the section comes into view.
- `HeroScene.tsx` is the 3D hero, loaded with `lazy()` so the text paints first. The page is lighter on phones (`mobile` flag from `isMobileDevice()`), per the commit "Light hero on phones".
- `ModelGlyph.tsx` draws each model's card icon.
- `startWord.ts` picks a random start word for the button in English (for example "Conjure" or "Ignite"). Mongolian always uses "Эхлэх". The test `startWord.test.ts` checks the pick.
- `MobileGate` (in `lab/`) replaces the lab on phones, with a message to open the app on a laptop and a copy-link button.

### 10.4 Code splitting

The lab is lazy-loaded (`lazy(() => import('../lab/LabPage'))` in `routes.tsx`). The MediaPipe bundle is only imported when the tracker starts. A production build (run for this document) produces these main chunks:

| Chunk | Size (min) | Size (gzip) |
|---|---|---|
| main (`index`) | 673 kB | 202 kB |
| shared three.js and model code (`modelRig`) | 1,138 kB | 308 kB |
| `LabPage` | 91 kB | 29 kB |
| MediaPipe vision | 154 kB | 45 kB |
| `HeroScene` | 0.7 kB | 0.5 kB |

Vite warns that a chunk is over 500 kB. This is a known trade-off: three.js is needed by every model, so splitting it further would not help much. The fix, if needed, is `manualChunks` or a larger `chunkSizeWarningLimit`. Neither is set today.

---

## 11. Cross-cutting: state, i18n, audio, analytics, privacy

### 11.1 State

| Store | Library | Persisted to `localStorage` | Purpose |
|---|---|---|---|
| `useLab` (`lab/labStore.ts`) | Zustand + `persist` | `hologemma.lab`: head parallax, tips seen, view style | camera status, tracking status, panels, debug flags |
| `useModel` (`lab/modelStore.ts`) | Zustand | no | current model, mode, explode, study part, assembly progress, motion |
| `useAtom` (`atoms/atomStore.ts`) | Zustand | no | atoms tab, particles, orbital, photons, experiment |
| `useQuality` (`scene/quality.ts`) | Zustand | no | the quality level set by the governor |
| `useLang` (`i18n/index.ts`) | Zustand + `persist` | `hologemma.lang` | language, default English |
| calibration | plain code | `hologemma.calibration` | grab and release thresholds, palm size |

A design choice worth explaining: the high-frequency data (hand positions, rig positions) is **not** in React state. The hand snapshot is read directly from `HandInput.latest` each frame, and the rig is mutated directly. Putting 60 Hz data in React state would re-render the whole tree and make it stutter. Zustand is used only for the things the UI needs to render when they change.

`LabContext` provides the long-lived services (`HandInput`, `PointerHub`, `FaceTracker`) to the components below the lab page.

### 11.2 Internationalization

- Two dictionaries: `src/i18n/en.json` and `src/i18n/mn.json` (Mongolian, Cyrillic). All text is in them, and the code has no hard-coded UI strings.
- `useT()` translates fixed keys. `useTx()` translates keys built at runtime (model parts) and falls back to English, then to the raw key.
- English is the default, and the chosen language is remembered.
- `i18n.test.ts` checks that every key in English exists in Mongolian and the reverse. The Mongolian text was written for the project, and PROGRESS.md flags it for review by a Mongolian speaker.

### 11.3 Sound (`audio/sfx.ts`)

All sounds are synthesised with the Web Audio API (oscillators, noise and envelopes), with no audio files. The sounds are `click`, `hover`, `pick`, `snap`, `wrong`, `success`, `open`, and the heart's `lub` and `dub`. The `AudioContext` is created on the first user gesture, because browsers block audio until then. There is no mute button, since the browser's tab mute is enough.

### 11.4 Analytics (`analytics.ts`, `lab/labAnalytics.ts`)

- `@vercel/analytics` is cookieless. `inject()` starts it and `track()` sends custom events.
- Events are sent from the stores (`trackLab`) and are limited to names and small properties: `camera` (live or mouse, with the reason), `hand_tracking` (running or error), `calibration_closed`, `head_parallax`, `lab_open`, `study_open`, `assembly_start`, `assembly_complete`, and `explode` (once per model per visit).
- No camera data, landmarks, or images are ever sent.

### 11.5 Privacy and security

- The camera stream stays in a local `<video>` element. Only the on-device MediaPipe models read it.
- Nothing is uploaded. The only network requests are for the app's own files, the MediaPipe models (copied at build time, not fetched at runtime), and the Vercel analytics beacon.
- The landing page has a privacy section, and the lab shows a privacy line (`landing.privacyText`, `lab.privacy`).

---

## 12. Build, test, deploy, and how to reproduce

### 12.1 Local development

```bash
npm install            # installs dependencies
npm run dev            # predev: copies MediaPipe WASM, downloads its models; then Vite on :5173
```

Open `http://localhost:5173`. The lab routes are `/lab/heart`, `/lab/brain`, `/lab/skeleton`, `/lab/muscles`, `/lab/robot-dog`, `/lab/rocket-engine`, `/lab/electric-motor` and `/lab/atoms`. Use desktop Chrome or Edge with a webcam. Without a camera the lab switches to mouse mode.

Debug keys: `D` toggles the hand overlay, `` ` `` opens the tuning panel, and `?fx=0` disables post-processing.

### 12.2 Commands

| Command | What it does | Verified on `main` |
|---|---|---|
| `npm test` | Vitest, 11 test files, 85 tests | pass (85 of 85) |
| `npm run build` | `tsc -b` type-check, then `vite build` | type-check passes; `vite build` completes |
| `npm run typecheck` | `tsc -b` only | pass |
| `npm run lint` | oxlint | runs; the warnings shown are in the vendored `.agents/` skill scripts, not in `src/` |
| `npm run format` | Prettier, writes files | not run |
| `npx tsx scripts/build-heart.ts` | regenerate `heart.glb` (needs network) | not run |

The `prebuild` and `predev` hooks run `scripts/sync-mediapipe.mjs`, so the first build needs network access to Google storage for the two model files. Later builds skip the download if the files exist.

### 12.3 Deployment

- Vercel builds the app from `main`. The `vercel.json` rewrite sends every path to `index.html`, so React Router handles the URLs.
- Analytics is enabled in the Vercel dashboard. PROGRESS.md notes that this must be switched on once there.
- Phones get the landing page and the mobile gate, because the lab needs a laptop webcam and enough GPU.

### 12.4 Test coverage by area

| Area | What the tests check |
|---|---|
| `input/filters` | One Euro filter behaviour (smoothing at rest, lag when fast) |
| `input/handGeometry` | pinch ratio, curls, fist and open-palm classification |
| `input/gestures` | hold times, hysteresis, coasting, fist rules, pinch progress |
| `input/calibration` | threshold derivation, and rejecting implausible samples |
| `input/coords` | video-to-screen mapping for cover-cropped mirrored video |
| `input/camera` | error classification |
| `models/models.test` | every part exists in its GLB, part ids are unique, dependencies are valid, assembly has no cycles, every text exists in English and Mongolian |
| `i18n/i18n.test` | the two dictionaries stay in step |
| `scene/motion/dogMotion` | two-bone IK: recovers the standing pose and reaches targets across the stride |
| `landing/startWord` | every English word can be picked; Mongolian always gives the one word |
| `atoms/atoms` | see §10.2 for the full list |

The gesture logic is the most important part to test, because the brief said gestures must never drop a part. Most of the tests run without a browser or a camera, which is why `src/input/` has no framework imports.

Hand tracking itself was checked with a recorded hand video in a headless browser (PROGRESS.md reports about 30 fps on the GPU delegate). Webcam behaviour cannot be tested in CI, so the developer ran a checklist on a real laptop after each phase.

---

## 13. Known discrepancies in the docs

The planning files were written during the build and were not all updated. Where they disagree with the code, the code is correct. This is the list an engineer should know about:

| Topic | Document says | Code does |
|---|---|---|
| Lint tool | PLAN.md: ESLint + Prettier | oxlint + Prettier (PROGRESS.md notes the change) |
| First-visit calibration | PLAN.md and the spec: about 3 s of open palms | 1.5 s (`CalibrationSession.PALM_MS`) |
| Folder layout | PLAN.md lists `modes/`, `ui/` folders, `scene/interaction/` | No `modes/` folder. Modes live in `modelStore`, the controller and `lab/panels/`. |
| Model schema field | spec v1 uses `run: RunAnimation` | `motion?: 'heart' \| 'motor' \| 'rocket' \| 'dog'` |
| Heart file size and parts | PROGRESS.md: 0.9 MB | 1.63 MB after the "more detail" commit (148k triangles) |
| Robot dog file size | PROGRESS.md: 0.6 MB | 0.94 MB after the "more detail" commit (87k triangles) |
| Brain part count | `build-brain.ts` header comment says 23 | 22 in the definition and in CREDITS.md. The comment is stale. |
| Vessel manual transform | PLAN.md: fall back to a stored manual transform | Not needed: the code comment says both files share one frame |
| Routes | README lists `/lab/heart`, `/lab/robot-dog` | Eight lab routes plus `/lab/atoms` |
| Skeleton and muscle licence | BodyParts3D header says CC BY-SA 2.1 JP | CREDITS.md explains: the database's current licence page says CC BY 4.0 |

None of these affect the running app. They do matter for anyone who reads the planning files as a specification.

---

## 14. How to add a new model

The README gives the short version. In detail:

1. **Build the GLB.** Write `scripts/build-<name>.ts`. Use `writePartsGlb()` from `scripts/lib/output.ts`. Each part is a named triangle soup with a triangle budget. Write the file to `public/models/<name>.glb`. Commit the GLB and the script.
2. **Check the node names.** Run `npx tsx scripts/inspect-glb.ts public/models/<name>.glb`.
3. **Write the definition.** Create `src/models/<name>/definition.ts` with a `ModelDefinition`. Give every part a `group`, a `color`, and `dependsOn` (the assembly order). Add `looks` for the Realistic view. Add `sources` for the credits.
4. **Register it.** Add it to `library` in `src/models/registry.ts`.
5. **Write the text.** Add the title, summary, credit, group names, and a description and fact for each part to both `en.json` and `mn.json`. The model tests fail if a key is missing.
6. **Optional motion.** If the model moves, add a file in `src/scene/motion/` that returns a `RigMotion`, add its name to the `motion` union in `ModelDefinition.ts`, and wire it up in `ModelScene.tsx`.
7. **Verify.** Run `npm test` and `npm run build`. Then open `/lab/<slug>` in a browser and check that every part can be selected, exploded, studied and assembled.

No mode code changes. That is the point of the schema.

---

## 15. Development history

The repository's `main` branch was replaced with the Hologemma codebase (commit `4eb5911`, "Replace main with the Hololemma codebase"). The commits before it belong to an earlier project in the same repository. The Hologemma commits in order:

| Commit | Step |
|---|---|
| `3ead407` | Phase 0: scaffold (Vite, React, R3F, i18n, camera, hologram test scene) |
| `b107b11` | Phase 1: hand tracking, calibration, cursors, debug and tuning panels |
| `248901f` | Phase 3: asset pipeline for the heart and robot dog |
| `802a91e` | Mini Pupper NOTICE file |
| `77012bc` | Phases 2, 4, 5: gestures in the scene, explore/explode/study, assembly |
| `5e9d143` | Phase 7: deep-space landing page and model library |
| `f0ef6e2` | Phase 8: head-coupled 3D, auto quality, analytics, gesture tips |
| `824bf7f` | Light hero on phones, robots.txt, docs and progress |
| `0240c20` | Human brain |
| `547d95d` | Liquid-fuel rocket engine |
| `712d8e2` | Brushed DC electric motor |
| `5a96504` | Human skeleton |
| `1d4d164` | Human muscles and library glyphs |
| `71a78f2` | Atoms and quantum lab |
| `ef503de` | Realistic view |
| `468880f` | Optional motion: beating heart, running motor, firing rocket engine |
| `54a5fbf` | Robot dog walk and trot with 2-bone IK |
| `652eb0a` | More detail for the heart and robot dog |
| `3ae4349` | More muscles from Z-Anatomy |

All of these commits carry the same date (2026-10-27) in the repository, so the order is the reliable record.

The development followed the phased plan in `.plans/hologemma-v1-spec.md`: each phase was built, run, committed, pushed to a Vercel preview, and then checked by the owner on a real webcam before the next phase. The v2 spec (`.plans/hologemma-v2-spec.md`) records the later decisions for the brain, skeleton, muscles, engines, atoms, realism and motion.

The `.agents/skills/` folder holds design and animation guidance that was used during development (animation, UI polish, and frontend-design skills). `skills-lock.json` records their sources and hashes, and `.claude/skills` is a symlink to them. These are reference material for the coding agent and are not part of the app's runtime.

---

## 16. Glossary

| Term | Meaning in this project |
|---|---|
| **Landmark** | One of 21 points MediaPipe finds on each hand (wrist, knuckles, joints, fingertips). |
| **Pinch ratio** | Thumb-to-index distance divided by palm size. Small means closed. |
| **Palm size** | Wrist to middle-finger knuckle distance. It normalizes all hand measurements. |
| **Hysteresis** | Using two thresholds (grab and release) so a state does not flicker near one value. |
| **One Euro filter** | A smoothing filter whose cutoff rises with speed: smooth when still, responsive when moving. |
| **Coasting** | Keeping a hand's last state for a short time after it disappears from the frame. |
| **Dwell** | Pressing a HUD button by hovering the hand over it for a set time. |
| **Explode** | Animating parts outward from their assembled positions. |
| **Study** | A view that brings one part to the centre with its information card. |
| **Bench** | The arc where unplaced parts wait during assembly. |
| **Ghost** | The faint outline of an empty slot during assembly. |
| **Fresnel** | Brightness that depends on the viewing angle, so edges glow. Used for the hologram rim. |
| **Additive blending** | Colours add together, so overlapping transparent parts brighten rather than hide. |
| **GLB** | The binary glTF 3D file format used for every model. |
| **Triangle soup** | A mesh stored as a flat list of triangles, with no shared vertices. The build scripts start from this. |
| **Meshopt** | A library for simplifying and compressing meshes. |
| **Quantization** | Storing positions and normals in fewer bits (here 16-bit) to shrink the file. |
| **BVH** | A bounding-volume hierarchy, a tree that makes ray picking fast on large meshes. |
| **URDF** | An XML format describing a robot's links and joints. Used for the robot dog. |
| **Inverse kinematics (IK)** | Working out joint angles from a wanted foot position. |
| **HRA** | Human Reference Atlas, the source of the heart and brain models. |
| **BodyParts3D** | The open anatomy mesh database used for the skeleton and muscles. |
| **PBR** | Physically based rendering: materials described by roughness, metalness and so on. The Realistic view. |
