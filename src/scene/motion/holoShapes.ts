// Small holographic shapes drawn by motions around a model: vessel tubes, organs and
// text labels. All are faint, additive and never pickable, so they never get in the way.
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  type BufferGeometry,
  type Curve,
  type Vector3,
} from 'three'
import type { V3 } from './circuit'

const fresnelVs = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fresnelFs = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.0);
    float a = (0.18 + 0.82 * rim) * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

/** Glassy rim-lit material (brighter at the silhouette), additive. */
export function holoMaterial(color: string, opacity: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: opacity } },
    vertexShader: fresnelVs,
    fragmentShader: fresnelFs,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  })
}

function decorate(mesh: Mesh): Mesh {
  mesh.raycast = () => {}
  mesh.renderOrder = 1
  return mesh
}

export function tubeMesh(curve: Curve<Vector3>, radius: number, color: string, opacity = 0.35): Mesh {
  return decorate(new Mesh(new TubeGeometry(curve, 48, radius, 8, false), holoMaterial(color, opacity)))
}

/**
 * A lung-shaped lobe: an ellipsoid with a narrow apex and a flattened inner (medial)
 * side facing the heart. `medial` is +1 when the heart lies towards +x.
 */
export function lungMesh(center: V3, radii: V3, medial: 1 | -1, color: string): Mesh {
  const g: BufferGeometry = new SphereGeometry(1, 40, 28)
  const p = g.getAttribute('position')
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    const y = p.getY(i)
    let z = p.getZ(i)
    const taper = y > 0.2 ? 1 - (y - 0.2) * 0.55 : 1 - Math.max(0, -y - 0.7) * 0.4
    x *= taper
    z *= taper
    if (x * medial > 0) x *= 0.45
    p.setXYZ(i, x * radii[0], y * radii[1], z * radii[2])
  }
  g.computeVertexNormals()
  const mesh = decorate(new Mesh(g, holoMaterial(color, 0.32)))
  mesh.position.set(...center)
  return mesh
}

export function sphereMesh(center: V3, radius: number, color: string, opacity = 0.4): Mesh {
  const mesh = decorate(new Mesh(new SphereGeometry(radius, 24, 16), holoMaterial(color, opacity)))
  mesh.position.set(...center)
  return mesh
}

/** A text label that always faces the camera. `height` is in the parent's units. */
export class Label {
  readonly sprite: Sprite
  private canvas = document.createElement('canvas')
  private texture: CanvasTexture
  private text = ''
  private height: number
  private color: string

  constructor(height: number, color = '#bff6ff') {
    this.height = height
    this.color = color
    this.canvas.width = 512
    this.canvas.height = 96
    this.texture = new CanvasTexture(this.canvas)
    this.sprite = new Sprite(new SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false }))
    this.sprite.renderOrder = 4
    this.sprite.raycast = () => {}
  }

  set(text: string): void {
    if (text === this.text) return
    this.text = text
    const ctx = this.canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.font = '600 44px "JetBrains Mono Variable", ui-monospace, monospace'
    const width = Math.min(this.canvas.width - 8, ctx.measureText(text).width + 40)
    ctx.fillStyle = 'rgba(4, 12, 24, 0.6)'
    ctx.beginPath()
    ctx.roundRect((this.canvas.width - width) / 2, 14, width, 68, 12)
    ctx.fill()
    ctx.fillStyle = this.color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, this.canvas.width / 2, 50)
    this.texture.needsUpdate = true
    this.sprite.scale.set((this.height * this.canvas.width) / this.canvas.height, this.height, 1)
  }

  dispose(): void {
    this.sprite.removeFromParent()
    this.texture.dispose()
    this.sprite.material.dispose()
  }
}

export function disposeMesh(mesh: Mesh): void {
  mesh.removeFromParent()
  mesh.geometry.dispose()
  ;(mesh.material as ShaderMaterial).dispose()
}

const streamFs = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uRepeat;
  varying vec2 vUv;
  void main() {
    // Bright dashes sliding along the tube show which way it flows.
    float dash = smoothstep(0.55, 1.0, fract(vUv.x * uRepeat - uTime));
    float a = (0.25 + 0.75 * dash) * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`

const streamVs = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/** A thin tube with dashes flowing from its start to its end (field lines, nerve fibres). */
export class StreamTube {
  readonly mesh: Mesh
  private material: ShaderMaterial

  constructor(curve: Curve<Vector3>, radius: number, color: string, repeat = 6) {
    this.material = new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(color) },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uRepeat: { value: repeat },
      },
      vertexShader: streamVs,
      fragmentShader: streamFs,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    })
    this.mesh = decorate(new Mesh(new TubeGeometry(curve, 64, radius, 6, false), this.material))
  }

  /** `flow` advances the dashes (in dash lengths); `opacity` 0 hides the tube. */
  update(flow: number, opacity: number): void {
    this.material.uniforms.uTime.value += flow
    this.material.uniforms.uOpacity.value = opacity
    this.mesh.visible = opacity > 0.005
  }

  dispose(): void {
    disposeMesh(this.mesh)
  }
}
