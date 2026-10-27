import { AdditiveBlending, Color, ShaderMaterial } from 'three'

/** Additive point-sprite material with per-point colour and size. */
export function createGlowPointsMaterial(size = 0.05): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uSize: { value: size }, uScale: { value: 400 }, uTint: { value: new Color('#ffffff') } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float alpha;
      uniform float uSize;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.5, uSize * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        gl_FragColor = vec4(vColor * uTint * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
}
