# Progress

Live: **https://hologemma.vercel.app** · Repo: `brkh1222-byte/Hologemma` (private; every push to `main` deploys).
Spec: `.plans/hologemma-v1-spec.md` · Design: `PLAN.md`.

## v3: computer hardware (realistic only)

| Item | Status | Notes |
|---|---|---|
| Computer hardware | ✅ | Original mid-tower PC built in code from ATX, PCIe, DIMM and drive sizes (`scripts/build-computer.ts`), ~160k triangles. 20 assembly parts, realistic view only (no hologram switch), assembly chain from case to side panel. Mongolian text needs review. |
| Multi-material parts | ✅ | A part can carry several looks (GLB primitives named by look id); the rig merges them into one geometry with a material per group. Used for gold contacts, chips, labels, LEDs, copper, sleeved wires |

Details: LGA socket with contact field, load plate and lever; CPU with heat spreader and land pads; tower cooler with U heat pipes and 48 fins; DDR5 modules with edge contacts and light bars; GPU with stepped PCB, gold fingers, backplate, fin stack, three fans and output bracket; modular PSU with grille and honeycomb rear; individually modelled 24-pin, 8-pin CPU, 8-pin PCIe and SATA power wires routed behind the tray through grommets.

Known limits: no textures (no printed text or silkscreen), and the model is procedural, not scanned. SATA data cables are not modelled.

## v2 (2026-10-27): new models, realism, motion

| Item | Status | Notes |
|---|---|---|
| Human brain | ✅ | HRA brain (Allen structures), CC BY 4.0, 22 parts |
| Skeleton | ✅ | BodyParts3D (CC BY 4.0), 34 bone groups |
| Muscles | ✅ | 43 groups on a skeleton base: BodyParts3D, plus latissimus dorsi, the abdominal muscles, quadratus lumborum and the jaw and face muscles from Z-Anatomy (exported with embedded scripts disabled). The model is CC BY-SA 4.0 |
| Rocket engine | ✅ | Original, modelled in code (gas-generator cycle), 18 parts |
| Electric motor | ✅ | Original brushed DC motor, 14 parts |
| Atoms & quantum lab | ✅ | Build atoms (Z ≤ 20), hydrogen orbitals (real ψ), energy levels and photons, double slit, Stern–Gerlach |
| Realistic view | ✅ | PBR presets, studio lighting, Hologram/Realistic switch |
| More detail | ✅ | Heart 148k triangles, robot dog 87k |
| Accounts | 🚧 | Firebase Auth (Google + email/password); the lab requires login. Needs the Firebase config and console setup. Mongolian auth text needs review |
| Saved progress | 🚧 | Firestore: profile + per-model progress (studied parts, assemblies, best time) on library cards, lab part list and /profile. Needs the database created and `firestore.rules` published |
| Motion | ✅ | Heart beat (BPM, valves, blood flow, ECG, sounds), motor spin, rocket firing, dog walk/trot with IK |

### v2 test checklist
1. Library: the brain, skeleton, muscles, rocket engine, electric motor and atoms cards open.
2. In any model, switch Hologram ↔ Realistic.
3. Heart → "Make it beat": change the BPM; watch the ECG and the phase text; try the cut-away while it beats.
4. Robot dog → "Make it walk": switch between Walk and Trot.
5. Rocket → "Fire the engine". Motor → "Run the motor".
6. Atoms: add protons, neutrons and electrons (bins or +/−); go through the orbitals (n, l, m); press "n=…" in Light; run the double slit with and without "Watch which slit"; try the spin setups.

## v1 status (built 2026-10-27, tested by the owner)

| Phase | Status | Notes |
|---|---|---|
| 0 Setup | ✅ | Vite + React 19 + TS strict, R3F, Zustand, React Router, Vitest. oxlint instead of ESLint (the current Vite default) |
| 1 Tracking + calibration | ✅ | Self-hosted MediaPipe (GPU, CPU fallback). Verified headless with a hand video: 2 hands at ~30 fps on GPU; quick calibration completes |
| 2 Gestures + interaction | ✅ | State machine with hold times + hysteresis; a fist releases a pinch; mouse mode; dwell-to-press HUD; tuning panel (`` ` ``) and debug overlay (`D`) |
| 3 Assets | ✅ | `scripts/build-heart.ts` (HRA, CC BY 4.0, 18 parts, 0.9 MB) and `scripts/build-dog.ts` (Mini Pupper 2, Apache-2.0, 22 parts incl. our servos + battery, 0.6 MB) |
| 4 Explore / Explode / Study | ✅ | Both models; heart cut-away; anatomy tints |
| 5 Assembly | ✅ | Bench, ghost slots, snap, dependency hints, Hint → auto-place, completion |
| 6 Content | ✅ | EN + MN for all parts, facts and hints. **Mongolian needs the owner's review** |
| 7 Landing | ✅ | Deep-space hero (3D on desktop, light on phones), library, random Start word, phone gate. Lighthouse: phone 94 / desktop 99 performance |
| 8 Polish | ✅ | Head-coupled 3D (off by default), auto quality, synthesized sounds, Vercel Analytics events, gesture tips |

Tests: 49 unit tests (filters, hand geometry, gestures, calibration, coordinates, i18n parity, model data vs GLBs).

## Webcam test checklist (for the owner)
1. Open https://hologemma.vercel.app in Chrome on a laptop, press the Start word, choose the heart, allow the camera.
2. **Hand setup:** show both open palms. The ring fills, then the gesture tips appear once.
3. **Pinch** (thumb + index) on the heart and move: it turns, and keeps spinning a little when you let go.
4. **Pinch with both hands near the heart and pull apart:** it comes to pieces. Push your hands together: it closes.
5. With it apart, **pinch one part** to pull it out. Keep holding, **pinch with the other hand and pull away**: Study opens.
6. **Hover a hand over any button** until it fills: it presses. Try the cut-away slider by pinching it.
7. **Make a fist for 1 second:** it goes back.
8. **Assemble it:** carry parts from the bench to their glowing outlines. Try a wrong one first: it bounces back with a reason.
9. Settings: Recalibrate (full setup), 3D by head movement, language МН.
10. Press `D` to see the tracking overlay. If grabs feel jumpy or sticky, open the tuning panel with `` ` `` and note the values that feel right.

## Known issues / to watch
- Thresholds are defaults from the reference; tune them after real testing (tuning panel).
- Head-coupled 3D runs a second tracker; on weak laptops leave it off (the default).
- Vercel Web Analytics must be switched on once in the Vercel dashboard (Project → Analytics → Enable).
- The robot dog's servos and battery are our approximations of the real layout.

## Next (v2)
Heartbeat with valve timing and blood-flow particles; robot dog gaits with IK; more library models.
