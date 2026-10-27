# Hololemma: Build Plan

A public web app: **a holographic 3D lab you control with bare hands through an ordinary webcam.** No headset, no gloves, nothing to install. The user sees their own mirrored webcam feed with glowing 3D objects floating in front of them. They grab, rotate, scale, explode and reassemble those objects with hand gestures. Audience: high-school students.

**Version 1 is structure only** (explore, take apart, study, rebuild) for **two models**:

1. **Human heart**: Human Reference Atlas heart + vessels (CC BY 4.0).
2. **Robot dog**: based on the open-source Mini Pupper 2 (Apache-2.0), plus our own servos and battery.

Heartbeat and dog walking are **v2**.

> **The interview decisions live in [`.plans/hololemma-v1-spec.md`](.plans/hololemma-v1-spec.md). Where the two files differ, the spec wins.** This file holds the detailed design. Progress is tracked in `PROGRESS.md`.

---

## 0. Reference research: what the inspiration product does

The inspiration is M2 Holo Lab (m2holo.com), built by one developer. I watched its 6 demo videos and read the LinkedIn thread.

- **It is not a real hologram.** It is AR on a flat screen. The full-screen mirrored webcam is the background, and a transparent WebGL layer on top draws see-through glowing models: cyan, fresnel rim, edge lines, bloom, floating labels.
- **Hand tracking uses MediaPipe**, with the developer's own gesture logic on top. A separate head/face tracker drives a "3D by head" parallax toggle. All of this was confirmed by the developer.
- **Calibration** takes about 10 s: open palms → pinch → fist. The calibration screen shows useful numbers, which we take as starting defaults:
  - pinch ratio (normalized by palm size): closed ≈ 0.16, open ≈ 1.18
  - **grab below 0.34, release above 0.60** (hysteresis)
  - index finger angle during a pinch > 74°, fist > 195° total curl
  - rest jitter ≈ 2% of palm (≈ 2 mm)
  - tracking ≈ **29 Hz**
- **Interaction patterns** that work well, which we adopt in our own form:
  - pull the hands apart to explode the model
  - pinch a part and stretch with the other hand to open it full screen with an info card
  - assembly mode with ordered parts and hints
  - a right-docked panel with a part tree
  - keyboard shortcuts as a fallback

**Ground rule:** we take ideas only. No code, assets, UI design, branding or text from the reference (see §1).

---

## 1. Ground rules

- **Everything original.** Don't copy anyone's code, 3D assets, UI design, branding or text. We write all UI copy and educational text ourselves.
- **The robot dog is outsourced** from Mini Pupper 2's open-source CAD. Its title in the app is "Robot Dog", and the credit goes to MangDang.
- **Privacy.** All camera processing stays in the browser. Never upload, store or log video frames. Show a one-line privacy note on the camera permission screen.
- **Attribution.** Honor every third-party licence. Keep `CREDITS.md` and an in-app Credits panel.
- **Languages.** **English first**, with a toggle to **Mongolian (Cyrillic)**; the choice is remembered. All strings live in `src/i18n/en.json` and `src/i18n/mn.json`; no hard-coded UI text.
- **Platform.** The lab runs on desktop Chrome and Edge. The landing page works everywhere; on mobile, the Start button becomes "Open on a laptop with a webcam" plus a copy-link button. Without a camera, the lab runs in **mouse mode**.
- **Performance.** At least 30 fps on a mid-range laptop with integrated graphics.
- **Code quality.**
  - TypeScript strict mode, small modules.
  - Unit tests for the gesture logic.
  - Don't claim something works without running it.

---

## 2. Tech stack

| Layer       | Choice                                                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| App         | **Vite + React + TypeScript** (strict)                                                                                           |
| 3D          | **Three.js via @react-three/fiber**, plus `@react-three/drei`                                                                    |
| Post FX     | **@react-three/postprocessing**: bloom, light chromatic aberration, noise/scanlines, vignette                                    |
| Tracking    | **@mediapipe/tasks-vision**: `HandLandmarker` (2 hands, 21 landmarks each, GPU delegate) + `FaceLandmarker` (head position only) |
| State       | **Zustand**                                                                                                                      |
| Tests       | **Vitest**                                                                                                                       |
| Lint/format | ESLint + Prettier                                                                                                                |
| Model prep  | **gltf-transform** CLI scripts (inspect, simplify, Draco/Meshopt, rename nodes)                                                  |
| Sound       | WebAudio, all synthesized (no audio files)                                                                                       |

**Hard boundary:** `src/input/` (camera, tracking, filters, calibration, gestures) must not import React or Three. That keeps it testable and reusable.

---

## 3. Architecture

```
src/
  input/                # framework-agnostic: no React/Three imports
    camera.ts
    handTracker.ts        # HandLandmarker, driven by requestVideoFrameCallback
    faceTracker.ts        # FaceLandmarker → head position (x, y, z)
    filters.ts            # One Euro filter
    calibration.ts        # per-user hand size + pinch thresholds (localStorage)
    gestures.ts           # pinch, grab, release, two-hand spread, fist, open palm, point
    gestureEvents.ts      # typed event emitter
  scene/
    HoloCanvas.tsx        # transparent R3F canvas over the mirrored <video>
    HoloMaterial.ts       # fresnel rim, scanlines, flicker, additive, per-part tint
    PostFX.tsx
    HandCursors.tsx       # fingertip cursors + pinch fill ring
    HeadParallax.ts       # off-axis camera from head position
    interaction/          # hand → object picking, grab/rotate/scale controllers
  models/
    ModelDefinition.ts    # shared schema (§5)
    heart/                # definition, loader, beat animation, info cards
    robotDog/             # part definitions for the Mini Pupper 2-based GLB
  modes/
    ExploreMode.tsx  ExplodeMode.tsx  StudyMode.tsx  AssemblyMode.tsx   # RunMode in v2
  ui/                     # HUD panels, model picker, parts list, language toggle, credits, dev settings
  i18n/                   # en.json, mn.json
scripts/
  inspect-glb.ts          # list node/mesh names of a GLB
  build-heart.ts          # HRA heart + vessels → public/models/heart.glb
  build-dog.ts            # Mini Pupper 2 URDF/STL + our servos/battery → public/models/robot-dog.glb
public/models/
```

### Coordinate mapping (2D landmarks → 3D)

- MediaPipe returns normalized image coordinates. **Mirror X** so the image behaves like a mirror.
- Map each landmark onto an interaction plane in front of the camera.
- **Depth proxy:** compare the wrist → middle-MCP size with the calibrated size and nudge the hand nearer or farther. Keep this mild: webcam depth is noisy, so interaction should feel mostly 2.5D.
- Normalize every threshold by palm size, so gestures work at any distance from the camera.
- Map hands in **screen space**, independent of head parallax. Otherwise moving the head would move what the hand points at (see risks).

### Frame loop

- Tracking runs about 30 Hz, on `requestVideoFrameCallback`.
- Rendering runs at 60 Hz. Interpolate the filtered hand state between tracking frames.
- MediaPipe starts on the main thread, as the brief says. If profiling shows it costs render frames, move it into a Web Worker (OffscreenCanvas). It already sits behind `handTracker.ts`, so nothing else needs to change.

---

## 4. Gesture system (the most important part: it must feel reliable)

### Calibration (stored in localStorage)

**On the first visit, do quick calibration only:** show both open palms (~3 s) to measure hand size, and use the default pinch thresholds (0.34 / 0.60). The full 3-step calibration below is offered under "Recalibrate" in settings.

1. **Open both palms.** Measure each hand's reference size.
2. **Pinch three times.** Learn this user's closed and open pinch ratio, then derive the grab and release thresholds with hysteresis. Fall back to 0.34 / 0.60 if the samples are poor.
3. **Make a fist.** Confirms tracking works, then the lab opens.

Show animated hand icons and a progress ring for each step. Also measure rest jitter here, to tune the One Euro filter.

### Gestures

| Gesture                             | Detection                                        | Action                                                      |
| ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Point / hover                       | index extended, other fingers curled             | highlight the part under the fingertip, show its label      |
| Pinch (grab)                        | pinch ratio < grab threshold, held ≥ 80 ms       | pick up the object or part under the cursor                 |
| Pinch + move                        | while pinched                                    | move the grabbed part; on the whole model: trackball rotate |
| Release                             | ratio > release threshold                        | drop; snap if near the target slot                          |
| Two-hand pinch + spread/close (away from the model) | both pinched, not near the model | scale / zoom                                                |
| Two-hand pinch near the model + pull apart | both pinched near the model, hands move apart | **explode** (continuous; pushing together = **collapse**)   |
| Hold part + stretch with other hand | one hand holds, the other pinches and pulls away | open **Study**                                              |
| Fist held 1 s                       |                                                  | back / close panel                                          |

### Robustness

- One Euro filter on every landmark. Ignore low-confidence hands.
- Stable left/right identity across frames: match hands to the previous frame by wrist position, not only by MediaPipe's handedness label, which can flip.
- One state machine per hand: `idle → hover → pinching → dragging → released`.
- Fingertip cursors with a ring that fills as a pinch registers, so users always see what the system sees.
- **Debug overlay (`D` key):** landmarks, state per hand, fps, pinch ratio against the thresholds.
- HUD buttons work by hover-dwell (600 ms fill) as well as by pinching.
- **Dev settings panel:** every threshold and filter parameter is tunable live (min cutoff, beta, grab/release, hold time, dwell time, explode speed).
- Keyboard and mouse fallback for every action, for testing and for tired arms.

---

## 5. Shared model schema

Both models implement the same schema, so every mode works for both without model-specific code in the modes.

```ts
interface PartDef {
  id: string;
  nameKey: string; // i18n key
  descriptionKey: string; // i18n key, 2–4 sentence educational card
  group: string; // e.g. "chambers", "legs"
  meshNames: string[]; // nodes in the GLB or procedural meshes
  assembledTransform: Transform;
  explodedOffset: Vector3; // direction × distance when exploded
  dependsOn: string[]; // parts that must be placed first
  wrongOrderHintKey?: string; // why this part can't go yet
  color?: string;
}
interface ModelDefinition {
  id: "heart" | "robotDog";
  titleKey: string;
  parts: PartDef[];
  groups: { id: string; nameKey: string }[];
  baseParts: string[]; // stay fixed on the bench during assembly
  run: RunAnimation; // heart: beat cycle; dog: gait
}
```

### Modes, shared by both models

- **Explore.** Rotate, scale and inspect the whole model. Hovering shows part labels.
- **Explode.** Parts fly out along `explodedOffset` with an eased animation. A thin line leads back to each part's origin.
- **Study.** The part fills the view and an info card appears. Next/Prev buttons; the part returns to its place on exit.
- **Assembly.**
  - Parts lie on a holographic workbench arc, and each target slot glows as a ghost outline.
  - While a part is carried, a dotted line leads to its slot. Dropping it within the tolerance snaps it in, with a flash and a sound.
  - If `dependsOn` isn't met, the part bounces back to the bench and the `wrongOrderHintKey` text appears.
  - The Hint button highlights the next valid part; pressing it twice auto-places that part.
  - Progress is tracked, and completion is celebrated.
- **Run.** Plays the model's animation (§6, §7).

---

## 6. Model: Robot dog (Mini Pupper 2, outsourced)

- **Source:** `github.com/mangdangroboticsclub/mini_pupper_ros`, Apache-2.0.
  - meshes: `mini_pupper_description/meshes/mini_pupper_2/*.stl`
  - placement: `urdf/mini_pupper_2/mini_pupper_description.urdf.xacro`
- `scripts/build-dog.ts`:
  1. Parse the URDF and xacro.
  2. Place each STL at its joint origin; units go from mm to m.
  3. Name the nodes.
  4. Add **12 servo motors + 1 battery pack** that we model ourselves, matching the real layout.
  5. Export `public/models/robot-dog.glb`.
- In the app it is titled **"Robot Dog"**, credited "based on Mini Pupper 2 by MangDang (Apache-2.0)". The LICENSE/NOTICE text is shown in the credits.

### Assembly units (~20)

Study and Explore still label the individual meshes.

- frame (base)
- battery
- controller board (PCB + connectors; the IMU is explained on its card)
- LiDAR
- front body
- side shells
- per leg (×4):
  - hip module (hip + hip servo)
  - upper-leg module (upper leg + knee servo + linkages)
  - lower leg + foot

### Assembly order

frame → battery → controller board → hip modules → upper-leg modules → lower legs + feet → LiDAR → front body → side shells

Hints explain the real engineering reason. For example: "The motors need power and a controller first." "The shells go on last so you can still reach the wiring."

### Info cards (high-school level)

What each part does in a real robot: servos and torque, the IMU and balance, LiDAR and mapping, the battery, and the controller running the control loop.

### v2 (not now)

Gaits (stand, walk, trot, sit) with 2-bone IK, X-ray covers, swing/stance labels.

---

## 7. Model: Human heart

### Source: Human Reference Atlas (HuBMAP), Visible Human **Male**, CC BY 4.0

- Heart: `https://cdn.humanatlas.io/digital-objects/ref-organ/heart-male/v1.3/assets/3d-vh-m-heart.glb`
  - chambers: RA, LA, RV, LV, septum
  - valves: mitral, tricuspid, aortic, pulmonary
  - 5 papillary muscles
- Vessels: `https://cdn.humanatlas.io/digital-objects/ref-organ/blood-vasculature-male/latest/assets/3d-vh-m-blood-vasculature.glb`
  - aorta and arch
  - pulmonary trunk and left/right arteries
  - 4 pulmonary veins
  - superior and inferior vena cava
  - left and right coronary arteries
  - cardiac veins and coronary sinus
- `scripts/build-heart.ts`:
  1. Download both files.
  2. Pick the nodes.
  3. **Trim the vessels** near the heart and cap the cuts.
  4. Verify the alignment; fall back to a stored manual transform.
  5. Simplify, compress with Meshopt, and write `public/models/heart.glb` (< 3 MB).
- Record the exact attribution and DOI in `CREDITS.md` and in the app.

### Parts (18, 5 groups)

- **Chambers:** right atrium, left atrium, right ventricle, left ventricle, interventricular septum
- **Valves:** tricuspid, mitral, pulmonary, aortic
- **Papillary muscles:** one part made of 5 meshes. The card also explains the chordae tendineae, which are not in the source.
- **Great vessels:** aorta + arch, pulmonary trunk + arteries, pulmonary veins, superior vena cava, inferior vena cava
- **Heart's own vessels:** left coronary artery, right coronary artery, cardiac veins + coronary sinus

### Colours (hologram with anatomy tints)

- **Blue** (oxygen-poor): RA, RV, pulmonary trunk and arteries, venae cavae, cardiac veins
- **Red** (oxygen-rich): LA, LV, aorta, pulmonary veins, coronary arteries
- **Gold/white:** valves
- **Violet:** septum, papillary muscles

### Assembly order

septum → ventricles → atria → papillary muscles → valves → great vessels → coronary vessels

Hints explain the anatomy. For example: "Valves sit between the chambers, so the chambers come first."

### Study mode

- **Cut-away slider:** a clipping plane slices the heart open to show the chambers and valves.
- Each card gives the part's function plus one memorable fact. Every fact must be anatomically correct.

### v2 (not now)

Beat cycle (BPM 40–180), valve timing, blood-flow particles, phase labels, ECG.

---

## 8. Visual style

- **Background:** the mirrored webcam feed, slightly darkened and desaturated so the holograms stand out.
- **Hologram material:** fresnel rim glow, slow horizontal scanlines, slight flicker, additive blending, a tint per part. The selected part brightens and the others dim.
- **Post FX:** bloom (tuned so text stays readable), light chromatic aberration, vignette.
- **Head-coupled parallax:** FaceLandmarker head position drives an off-axis camera, so moving your head lets you look around the object as if through a window. Toggle in settings, **off by default**.
- **HUD:** thin-line sci-fi panels docked to the right edge. Monospace for labels, a readable sans for body text. Both fonts must include Mongolian Cyrillic, including **Ө ө Ү ү**; for example JetBrains Mono + Inter.
- **Sound:** soft UI clicks, snap and success sounds, always on (no mute button; the browser's tab mute is enough). All generated with WebAudio.
- **Quality:** automatic and invisible. An fps monitor lowers bloom, DPR and effects when needed.
- **Grab feel:** light, damped momentum after a rotation is released.

---

## 9. Phases, risks and decisions

See **[`.plans/hololemma-v1-spec.md`](.plans/hololemma-v1-spec.md)**: Phases 0–8, acceptance criteria, risks, verification and every interview decision (landing page, routing, onboarding, analytics, deploy).

After each phase:
1. Run it and verify it.
2. Commit, then push to get a Vercel preview.
3. Update `PROGRESS.md`.
4. Give the user a webcam test checklist.
5. Wait for their feedback.

---

## 10. Later ideas (not v1)

- v2: heartbeat and blood flow; robot dog gaits.

- A real "hologram" output: a Pepper's-ghost pyramid mode (4-view render) or a Looking Glass display.
- Voice commands ("explode", "show the mitral valve") via the Web Speech API, and LLM Q&A about the focused part.
- A classroom mode: the teacher controls the model and students follow live.
- More models through the same `ModelDefinition` schema.
