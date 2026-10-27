// Self-hosts MediaPipe: copies the WASM runtime from node_modules and downloads
// the hand/face models into public/mediapipe (git-ignored). Runs before dev/build.
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'mediapipe')
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const wasmFiles = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]
const models = {
  'hand_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  'face_landmarker.task':
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
}

const exists = (path) => stat(path).then(() => true, () => false)

await mkdir(join(out, 'wasm'), { recursive: true })
for (const file of wasmFiles) await copyFile(join(wasmSrc, file), join(out, 'wasm', file))

for (const [file, url] of Object.entries(models)) {
  const target = join(out, file)
  if (await exists(target)) continue
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`)
  await writeFile(target, Buffer.from(await res.arrayBuffer()))
  console.log(`mediapipe: downloaded ${file}`)
}
