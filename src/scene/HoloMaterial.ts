import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'

// Hologram look: fresnel rim glow, slow scanlines, faint flicker, additive.
// Supports clipping planes (cut-away view), highlight and dimming.
const vertexShader = /* glsl */ `
  #include <clipping_planes_pars_vertex>
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPos;
    vWorldPos = worldPos.xyz;
    vNormalView = normalMatrix * normal;
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
    #include <clipping_planes_vertex>
  }
`

const fragmentShader = /* glsl */ `
  #include <clipping_planes_pars_fragment>
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uScanDensity;
  uniform float uIntensity;
  uniform float uHighlight;
  uniform float uFill;

  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    #include <clipping_planes_fragment>
    // Guard against degenerate (zero-length) normals and float overshoot:
    // a single NaN here gets smeared across the screen by the bloom pass.
    vec3 v = normalize(vViewDir);
    float nl = length(vNormalView);
    vec3 n = nl > 1e-5 ? vNormalView / nl : v;
    if (!gl_FrontFacing) n = -n;
    float facing = clamp(abs(dot(n, v)), 0.0, 1.0);
    float fresnel = pow(max(1.0 - facing, 0.0), uFresnelPower);

    float scan = 0.5 + 0.5 * sin(vWorldPos.y * uScanDensity - uTime * 2.0);
    scan = mix(0.78, 1.0, smoothstep(0.2, 0.9, scan));

    float flicker = 0.97 + 0.03 * sin(uTime * 23.0) * sin(uTime * 7.3);

    float body = uFill + fresnel * (1.0 - uFill);
    float alpha = body * scan * flicker * uOpacity;
    vec3 color = uColor * (0.35 + fresnel * 1.5) * uIntensity;
    color += uColor * uHighlight * (0.35 + fresnel * 0.9);
    color = mix(color, vec3(1.0), clamp(uHighlight - 1.0, 0.0, 1.0) * 0.6);
    alpha = clamp(alpha, 0.0, 1.0);
    gl_FragColor = vec4(max(color, vec3(0.0)) * alpha, alpha);
  }
`

export interface HoloMaterialOptions {
  color?: string
  opacity?: number
  fresnelPower?: number
  scanDensity?: number
  intensity?: number
  /** Base (non-rim) opacity: higher = more solid-looking. */
  fill?: number
}

export function createHoloMaterial(options: HoloMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uColor: { value: new Color(options.color ?? '#5ee7ff') },
      uTime: { value: 0 },
      uOpacity: { value: options.opacity ?? 1 },
      uFresnelPower: { value: options.fresnelPower ?? 2.2 },
      uScanDensity: { value: options.scanDensity ?? 60 },
      uIntensity: { value: options.intensity ?? 1 },
      uHighlight: { value: 0 },
      uFill: { value: options.fill ?? 0.12 },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    clipping: true,
  })
}
