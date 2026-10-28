// Shaders for the solar system. All lighting comes from the Sun alone: one
// direction or point, no studio lights or environment, so the night side is
// truly dark and phases, terminators and eclipses come out right.
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  DoubleSide,
  ShaderMaterial,
  SRGBColorSpace,
  Vector3,
  type Texture,
} from 'three'

/** Angular radius of the Sun seen from 1 AU, as a tangent: sets the width of penumbras. */
const SUN_TAN = 0.00465

/**
 * Soft shadow from a sphere between the fragment and the Sun. The penumbra widens
 * with distance behind the occluder, so umbra and penumbra come out as cones.
 */
const occlusion = /* glsl */ `
uniform vec3 uOccPos;
uniform float uOccR;
uniform float uOccOn;
float sunVisible(vec3 p, vec3 L) {
  if (uOccOn < 0.5) return 1.0;
  vec3 toOcc = uOccPos - p;
  float t = dot(toOcc, L);
  if (t <= 0.0) return 1.0;
  float d = length(toOcc - t * L);
  float w = t * ${SUN_TAN} + 1e-4;
  return smoothstep(uOccR - w, uOccR + w, d);
}
`

const occlusionUniforms = () => ({
  uOccPos: { value: new Vector3() },
  uOccR: { value: 0 },
  uOccOn: { value: 0 },
})

const worldVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vPos;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPos = world.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`

const localVertex = /* glsl */ `
varying vec3 vP;
varying vec2 vUv;
void main() {
  vUv = uv;
  vP = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const finish = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`

/** Sun light shared by every body: a point (system view) or a direction (close-ups). */
export interface SunLight {
  uSunPos: { value: Vector3 }
  uSunDir: { value: Vector3 }
  uDirectional: { value: number }
}

export const createSunLight = (): SunLight => ({
  uSunPos: { value: new Vector3() },
  uSunDir: { value: new Vector3(1, 0, 0) },
  uDirectional: { value: 0 },
})

const sunDirection = /* glsl */ `
uniform vec3 uSunPos;
uniform vec3 uSunDir;
uniform float uDirectional;
vec3 lightDir(vec3 p) { return uDirectional > 0.5 ? normalize(uSunDir) : normalize(uSunPos - p); }
`

/** Any planet or moon: a surface map lit by the Sun, optional atmosphere rim and eclipse shadow. */
export function createBodyMaterial(
  map: Texture,
  sun: SunLight,
  opts: { atmosphere?: string; regolith?: boolean },
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...sun,
      ...occlusionUniforms(),
      uMap: { value: map },
      uAtmo: { value: new Vector3(...hexToRgb(opts.atmosphere ?? '#000000')) },
      uAtmoOn: { value: opts.atmosphere ? 1 : 0 },
      uRegolith: { value: opts.regolith ? 1 : 0 },
    },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uAtmo;
      uniform float uAtmoOn;
      uniform float uRegolith;
      varying vec3 vN;
      varying vec3 vPos;
      varying vec2 vUv;
      ${sunDirection}
      ${occlusion}
      void main() {
        vec3 N = normalize(vN);
        vec3 L = lightDir(vPos);
        vec3 V = normalize(cameraPosition - vPos);
        float mu0 = dot(N, L);
        float mu = max(dot(N, V), 0.0);
        float lambert = max(mu0, 0.0);
        // Airless dust scatters back towards the Sun: Lommel–Seeliger keeps a full Moon evenly bright.
        float ls = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + mu + 1e-4) : 0.0;
        float lit = mix(lambert, min(ls, 1.6), uRegolith * 0.75);
        vec3 tex = texture2D(uMap, vUv).rgb;
        float shadow = sunVisible(vPos, L);
        // Inside Earth's umbra the Moon is lit only by sunsets on Earth: a dim red.
        vec3 umbraGlow = tex * vec3(0.32, 0.09, 0.03) * (1.0 - shadow) * step(0.0, mu0) * uOccOn;
        vec3 col = tex * lit * shadow * 1.35 + umbraGlow + tex * 0.006;
        float rim = pow(1.0 - mu, 3.0) * smoothstep(-0.25, 0.45, mu0) * uAtmoOn;
        col += uAtmo * rim * 0.9;
        gl_FragColor = vec4(col, 1.0);
        ${finish}
      }
    `,
  })
}

/** Local-space lighting inputs for the Earth (its mesh is a unit sphere). */
export interface EarthLocal {
  uSunLocal: { value: Vector3 }
  uCamLocal: { value: Vector3 }
  uCloudShift: { value: number }
  uOccPos: { value: Vector3 }
  uOccR: { value: number }
  uOccOn: { value: number }
}

export const createEarthLocal = (): EarthLocal => ({
  uSunLocal: { value: new Vector3(1, 0, 0) },
  uCamLocal: { value: new Vector3(0, 0, 5) },
  uCloudShift: { value: 0 },
  ...occlusionUniforms(),
})

export interface EarthMaps {
  day: Texture
  night: Texture
  normal: Texture
  ocean: Texture
  clouds: Texture
}

/**
 * Earth's surface, in the planet's own frame (y = north pole, x = Greenwich):
 * day map with relief, sunglint on the oceans, cloud shadows, a reddened
 * twilight band, and city lights that switch on past the terminator.
 */
export function createEarthMaterial(maps: EarthMaps, local: EarthLocal): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      ...local,
      uDay: { value: maps.day },
      uNight: { value: maps.night },
      uNormal: { value: maps.normal },
      uOcean: { value: maps.ocean },
      uClouds: { value: maps.clouds },
    },
    vertexShader: localVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDay;
      uniform sampler2D uNight;
      uniform sampler2D uNormal;
      uniform sampler2D uOcean;
      uniform sampler2D uClouds;
      uniform vec3 uSunLocal;
      uniform vec3 uCamLocal;
      uniform float uCloudShift;
      varying vec3 vP;
      varying vec2 vUv;
      ${occlusion}
      void main() {
        vec3 n = normalize(vP);
        vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-6, 0.0, 0.0));
        vec3 north = cross(n, east);
        float ocean = texture2D(uOcean, vUv).r;
        vec3 tn = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
        vec3 N = normalize(mix(normalize(east * tn.x + north * tn.y + n * max(tn.z, 0.2)), n, ocean));
        vec3 L = normalize(uSunLocal);
        vec3 V = normalize(uCamLocal - vP);
        float ng = dot(n, L);
        float nd = max(dot(N, L), 0.0);
        float shadow = sunVisible(n, L);

        float cloud = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
        // Clouds sit a few km up, so their shadows fall a little away from the Sun.
        float cloudShadow = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0) - (L.xz * 0.0015)).r;

        vec3 day = texture2D(uDay, vUv).rgb;
        // Low sun: light travels through more air and loses its blue.
        vec3 sunColor = mix(vec3(1.0, 0.55, 0.3), vec3(1.0), smoothstep(0.0, 0.3, ng));
        vec3 col = day * nd * sunColor * (1.0 - 0.45 * cloudShadow) * shadow * 1.55;

        vec3 H = normalize(L + V);
        float glint = pow(max(dot(n, H), 0.0), 90.0) * 1.4 + pow(max(dot(n, H), 0.0), 12.0) * 0.06;
        col += sunColor * glint * ocean * smoothstep(0.0, 0.08, ng) * (1.0 - cloud) * shadow;

        vec3 lights = texture2D(uNight, vUv).rgb;
        lights = pow(lights, vec3(1.8)) * vec3(1.0, 0.78, 0.48) * 2.6;
        float night = 1.0 - smoothstep(-0.16, 0.04, ng);
        col += lights * night * (1.0 - 0.75 * cloud);

        float rim = pow(1.0 - max(dot(n, V), 0.0), 2.2);
        vec3 haze = mix(vec3(1.0, 0.45, 0.2), vec3(0.32, 0.58, 1.0), smoothstep(-0.05, 0.35, ng));
        col = mix(col, haze * 1.25, rim * 0.55 * smoothstep(-0.2, 0.25, ng) * shadow);
        col += day * 0.003;
        gl_FragColor = vec4(col, 1.0);
        ${finish}
      }
    `,
  })
}

/** Cloud layer just above the surface (shares the Earth's local uniforms). */
export function createCloudMaterial(clouds: Texture, local: EarthLocal): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...local, uClouds: { value: clouds } },
    vertexShader: localVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D uClouds;
      uniform vec3 uSunLocal;
      uniform float uCloudShift;
      varying vec3 vP;
      varying vec2 vUv;
      ${occlusion}
      void main() {
        vec3 n = normalize(vP);
        vec3 L = normalize(uSunLocal);
        float ng = dot(n, L);
        float c = texture2D(uClouds, vUv + vec2(uCloudShift, 0.0)).r;
        vec3 sunColor = mix(vec3(1.0, 0.5, 0.28), vec3(1.0), smoothstep(0.0, 0.3, ng));
        float lit = smoothstep(-0.08, 0.2, ng) * (0.35 + 0.65 * max(ng, 0.0)) * sunVisible(n, L);
        gl_FragColor = vec4(sunColor * lit * 1.25, smoothstep(0.08, 0.9, c) * 0.96);
        ${finish}
      }
    `,
    transparent: true,
    depthWrite: false,
  })
}

/**
 * Atmosphere seen edge-on: brightness follows the length of the view ray through
 * a thin shell, fading with height; blue by day, orange along the terminator.
 */
export function createAtmosphereMaterial(local: EarthLocal, shell: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ...local, uShell: { value: shell } },
    vertexShader: localVertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunLocal;
      uniform vec3 uCamLocal;
      uniform float uShell;
      varying vec3 vP;
      void main() {
        vec3 dir = normalize(vP - uCamLocal);
        float b = dot(uCamLocal, dir);
        vec3 closest = uCamLocal - b * dir;
        float h = length(closest);
        if (h > uShell) discard;
        float chord = 2.0 * sqrt(max(uShell * uShell - max(h, 1.0) * max(h, 1.0), 0.0));
        float density = exp(-(max(h, 1.0) - 1.0) / ((uShell - 1.0) * 0.28));
        float sun = dot(normalize(closest), normalize(uSunLocal));
        vec3 color = mix(vec3(1.0, 0.42, 0.16), vec3(0.3, 0.56, 1.0), smoothstep(-0.1, 0.35, sun));
        float a = (1.0 - exp(-chord * density * 9.0)) * smoothstep(-0.35, 0.15, sun);
        gl_FragColor = vec4(color * a * 1.3, a);
        ${finish}
      }
    `,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}

/** The Sun: its surface map, darker towards the limb, bright enough to bloom. */
export function createSunMaterial(map: Texture): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uMap: { value: map } },
    vertexShader: worldVertex,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vN;
      varying vec3 vPos;
      varying vec2 vUv;
      void main() {
        float mu = max(dot(normalize(vN), normalize(cameraPosition - vPos)), 0.0);
        // Limb darkening: the edge shows cooler, higher layers of the photosphere.
        float limb = 1.0 - 0.6 * (1.0 - sqrt(mu));
        vec3 col = texture2D(uMap, vUv).rgb * vec3(1.25, 1.0, 0.8) * limb * 2.6;
        gl_FragColor = vec4(col, 1.0);
        ${finish}
      }
    `,
  })
}

/** Saturn's rings: the ring map along the radius, lit from either side, with the planet's shadow. */
export function createRingMaterial(
  map: Texture,
  sun: SunLight,
  inner: number,
  outer: number,
): ShaderMaterial & { uniforms: { uPlanet: { value: Vector3 }; uPlanetR: { value: number } } } {
  return new ShaderMaterial({
    uniforms: {
      ...sun,
      uMap: { value: map },
      uInner: { value: inner },
      uOuter: { value: outer },
      uPlanet: { value: new Vector3() },
      uPlanetR: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocal;
      varying vec3 vPos;
      void main() {
        vLocal = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform float uInner;
      uniform float uOuter;
      uniform vec3 uPlanet;
      uniform float uPlanetR;
      varying vec3 vLocal;
      varying vec3 vPos;
      ${sunDirection}
      void main() {
        float t = (length(vLocal.xy) - uInner) / (uOuter - uInner);
        if (t < 0.0 || t > 1.0) discard;
        vec4 tex = texture2D(uMap, vec2(t, 0.5));
        vec3 L = lightDir(vPos);
        vec3 oc = vPos - uPlanet;
        float b = dot(oc, L);
        float d = sqrt(max(dot(oc, oc) - b * b, 0.0));
        float shadow = b < 0.0 ? smoothstep(uPlanetR * 0.97, uPlanetR * 1.03, d) : 1.0;
        gl_FragColor = vec4(tex.rgb * (0.35 + 0.95 * shadow), tex.a * 0.95);
        ${finish}
      }
    `,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
  }) as ShaderMaterial & { uniforms: { uPlanet: { value: Vector3 }; uPlanetR: { value: number } } }
}

/** Soft glow around the Sun (a sprite texture), drawn additively. */
export function createGlowTexture(inner: string, outer: string): CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, inner)
  g.addColorStop(0.18, inner)
  g.addColorStop(0.32, outer)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  // To linear, roughly, so the rim colour matches the sRGB value given.
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)) as [
    number,
    number,
    number,
  ]
}
