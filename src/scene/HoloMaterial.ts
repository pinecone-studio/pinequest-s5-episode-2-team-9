import { AdditiveBlending, Color, DoubleSide, ShaderMaterial } from 'three'

// Hologram look: fresnel rim glow, slow scanlines, faint flicker, additive.
const vertexShader = /* glsl */ `
  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 viewPos = viewMatrix * worldPos;
    vWorldPos = worldPos.xyz;
    vNormalView = normalize(normalMatrix * normal);
    vViewDir = normalize(-viewPos.xyz);
    gl_Position = projectionMatrix * viewPos;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uScanDensity;
  uniform float uIntensity;

  varying vec3 vNormalView;
  varying vec3 vViewDir;
  varying vec3 vWorldPos;

  void main() {
    vec3 n = normalize(vNormalView);
    if (!gl_FrontFacing) n = -n;
    float fresnel = pow(1.0 - abs(dot(n, normalize(vViewDir))), uFresnelPower);

    float scan = 0.5 + 0.5 * sin(vWorldPos.y * uScanDensity - uTime * 2.0);
    scan = mix(0.75, 1.0, smoothstep(0.2, 0.9, scan));

    float flicker = 0.96 + 0.04 * sin(uTime * 23.0) * sin(uTime * 7.3);

    float alpha = (0.12 + fresnel * 0.88) * scan * flicker * uOpacity;
    vec3 color = uColor * (0.35 + fresnel * 1.6) * uIntensity;
    gl_FragColor = vec4(color * alpha, alpha);
  }
`

export interface HoloMaterialOptions {
  color?: string
  opacity?: number
  fresnelPower?: number
  scanDensity?: number
  intensity?: number
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
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
}
