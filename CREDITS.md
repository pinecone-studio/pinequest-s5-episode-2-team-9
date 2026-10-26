# Credits

Third-party assets and code used in Hololemma, with their licences. The same information is shown in the app (Settings → Credits).

## 3D models

### Human heart: Human Reference Atlas (HuBMAP), CC BY 4.0
`public/models/heart.glb` is built by `scripts/build-heart.ts` from two 3D reference organs of the Human Reference Atlas, made from the Visible Human Male (National Library of Medicine):

- Browne, Kristen. 2024. *3D Reference Organ for Heart, Male, v1.3.* HuBMAP. https://doi.org/10.48539/HBM564.WKNG.249
- Browne, Kristen, and Heidi Schlehlein. 2024. *3D Reference Organ for Blood Vasculature, Male, v1.3.* HuBMAP. https://doi.org/10.48539/HBM473.XTPP.725

Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

**Changes made:**
- Selected the heart chambers, valves and papillary muscles, plus the vessels at the heart (aorta, pulmonary trunk and arteries, pulmonary veins, venae cavae, coronary arteries, cardiac veins).
- Trimmed the long vessels near the heart.
- Grouped the meshes into 18 parts.
- Simplified and compressed the meshes.

### Human brain: Human Reference Atlas (HuBMAP), CC BY 4.0
`public/models/brain.glb` is built by `scripts/build-brain.ts` from:

- Browne, Kristen, and Heidi Schlehlein. 2023. *3D Reference Organ for Brain, Male, v1.3.* HuBMAP. https://doi.org/10.48539/HBM929.XKCL.339 (structures from the Allen Human Brain Atlas, registered to the Visible Human Male).

Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

**Changes made:**
- Grouped 283 structures into 22 parts.
- Left out the forebrain white-matter mass.
- Labelled the hemispheres by position, consistent with the heart model.
- Simplified and compressed the meshes.

### Robot dog: Mini Pupper 2 by MangDang, Apache License 2.0
`public/models/robot-dog.glb` is built by `scripts/build-dog.ts` from the Mini Pupper 2 robot description (URDF and STL meshes) in [mangdangroboticsclub/mini_pupper_ros](https://github.com/mangdangroboticsclub/mini_pupper_ros). Copyright MangDang. Licensed under the Apache License, Version 2.0; the full text is in `public/licenses/mini-pupper-apache-2.0.txt` and its NOTICE in `public/licenses/mini-pupper-NOTICE.txt`.

**Changes made:**
- Posed the legs standing.
- Converted the meshes to glTF.
- Grouped them into assembly parts.
- Simplified the meshes.
- **Added 12 servo motors and a battery pack modelled by Hololemma.** The original CAD has no separate meshes for them.

In the app the model is called "Robot Dog". Hololemma is not affiliated with MangDang.

## Fonts
- **Inter**, Rasmus Andersson. SIL Open Font License 1.1 (via @fontsource-variable/inter).
- **JetBrains Mono**, JetBrains. SIL Open Font License 1.1 (via @fontsource-variable/jetbrains-mono).

## Libraries
- MediaPipe Tasks Vision and its hand/face landmarker models (Google), Apache License 2.0.
- three.js, React Three Fiber, drei, postprocessing (MIT). React, React Router, Zustand (MIT).
