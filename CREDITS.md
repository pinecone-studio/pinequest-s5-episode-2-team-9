# Credits

Third-party assets and code used in Hologemma, with their licences. The same information is shown in the app (Settings → Credits).

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

### Human lungs: Human Reference Atlas (HuBMAP), CC BY 4.0
`public/models/lungs.glb` (and the air paths in `src/models/lungs/airways.json`) is built by `scripts/build-lungs.ts` from two 3D reference organs of the Human Reference Atlas, made from the Visible Human Male (National Library of Medicine):

- *3D Reference Organ for Lung, Male, v1.3.* HuBMAP. https://cdn.humanatlas.io/digital-objects/ref-organ/lung-male/v1.3/assets/3d-vh-m-lung.glb
- Browne, Kristen, and Heidi Schlehlein. 2024. *3D Reference Organ for Blood Vasculature, Male, v1.3.* HuBMAP. https://doi.org/10.48539/HBM473.XTPP.725

Licence: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

**Changes made:**
- Filled each lung as a volume and split it into its 18 bronchopulmonary segments (each voxel goes to the segment whose surface patch or segmental bronchus is nearest), then rebuilt the five lobes and the segments as closed, smoothed meshes.
- Split every segment into secondary pulmonary lobules (about 2.4 cm apart).
- Grouped the lobar and segmental bronchi per airway and gave each bronchus the cartilage plates nearest to it.
- Took the pulmonary trunk, arteries and veins from the vasculature organ.
- **Added the trachea and main bronchi (cartilage rings, trachealis, annular ligaments, mucosa) and the diaphragm (domes fitted under the lung bases, central tendon, crura, caval, oesophageal and aortic openings), modelled by Hologemma.** The atlas has no meshes for them.
- Traced the centre lines of the airway tree for the air flow.
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

### Skeleton (and muscles): BodyParts3D, CC BY 4.0
`public/models/skeleton.glb` is built by `scripts/build-skeleton.ts` (and `muscles.glb` by `scripts/build-muscles.ts`) from:

- "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International". https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html (version 4.0, 99 % reduced OBJ meshes).

The OBJ file headers still mention the older CC BY-SA 2.1 Japan licence. The database's current licence page states CC BY 4.0.

**Changes made:**
- Grouped individual bones and muscles into student-level parts.
- Converted from millimetres to metres and to a y-up frame.
- Simplified and compressed the meshes.

### Muscles: additional meshes from Z-Anatomy, CC BY-SA 4.0
`public/models/muscles.glb` also contains the following muscles from **Z-Anatomy**: latissimus dorsi, rectus abdominis, internal oblique, transversus abdominis, quadratus lumborum, the jaw muscles (masseter, temporalis, pterygoids) and the face muscles.

- Z-Anatomy, https://www.z-anatomy.com (models based on BodyParts3D, The Database Center for Life Science).
- Licence: [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

**Changes made:**
- Exported with Blender (`scripts/export-zanatomy.sh`, with embedded scripts disabled).
- Aligned to BodyParts3D with per-region fits, and grouped.

**Because of ShareAlike, `muscles.glb` is shared under CC BY-SA 4.0.** The app code is not affected.

### Robot dog: Mini Pupper 2 by MangDang, Apache License 2.0
`public/models/robot-dog.glb` is built by `scripts/build-dog.ts` from the Mini Pupper 2 robot description (URDF and STL meshes) in [mangdangroboticsclub/mini_pupper_ros](https://github.com/mangdangroboticsclub/mini_pupper_ros). Copyright MangDang. Licensed under the Apache License, Version 2.0; the full text is in `public/licenses/mini-pupper-apache-2.0.txt` and its NOTICE in `public/licenses/mini-pupper-NOTICE.txt`.

**Changes made:**
- Posed the legs standing.
- Converted the meshes to glTF.
- Grouped them into assembly parts.
- Simplified the meshes.
- **Added 12 servo motors and a battery pack modelled by Hologemma.** The original CAD has no separate meshes for them.

In the app the model is called "Robot Dog". Hologemma is not affiliated with MangDang.

## Solar system
Textures are resized and converted to WebP by `scripts/build-solar-textures.ts`.
- **Planet, Sun, Saturn ring, Earth (day, clouds, relief, oceans) and star maps**: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0, based on NASA mission data.
- **Moon colour**: NASA Scientific Visualization Studio, [CGI Moon Kit](https://svs.gsfc.nasa.gov/4720) (LRO LROC). Public domain.
- **Earth's city lights**: NASA Earth Observatory, [Black Marble 2016](https://earthobservatory.nasa.gov/features/NightLights). Public domain.
- **Planet positions**: E. M. Standish, JPL, [Keplerian Elements for Approximate Positions of the Major Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html).
- **Spin axes and rotation**: IAU Working Group on Cartographic Coordinates and Rotational Elements, report 2015 (Archinal et al., 2018).
- **Moon position**: low-precision lunar formulae of the Astronomical Almanac.
- **Planet facts**: NASA [Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/).

## Fonts
- **Inter**, Rasmus Andersson. SIL Open Font License 1.1 (via @fontsource-variable/inter).
- **JetBrains Mono**, JetBrains. SIL Open Font License 1.1 (via @fontsource-variable/jetbrains-mono).

## Libraries
- MediaPipe Tasks Vision and its hand/face landmarker models (Google), Apache License 2.0.
- three.js, React Three Fiber, drei, postprocessing (MIT). React, React Router, Zustand (MIT).
