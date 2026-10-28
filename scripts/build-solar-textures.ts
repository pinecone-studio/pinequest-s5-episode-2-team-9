// Builds public/solar/*.webp from real planetary maps (equirectangular, 2:1).
//   Solar System Scope textures (CC BY 4.0), made from NASA mission data:
//     https://www.solarsystemscope.com/textures/
//   NASA public domain: Black Marble 2016 city lights (Earth Observatory) and the
//     CGI Moon Kit (Scientific Visualization Studio, LRO LROC colour).
// Downloads are cached in scripts/.cache/solar. Usage: npx tsx scripts/build-solar-textures.ts
import { mkdir, stat, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const CACHE = 'scripts/.cache/solar'
const OUT = 'public/solar'
const SSS = 'https://www.solarsystemscope.com/textures/download'
const MOON_KIT = 'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720'

interface Tex {
  out: string
  url: string
  width: number
  quality?: number
  /** Single-channel data (clouds, masks, heights) compress better as greyscale. */
  grey?: boolean
  /** Keep the alpha channel (Saturn's rings). */
  alpha?: boolean
}

// Earth gets the most pixels: it is the one you zoom into.
const TEXTURES: Tex[] = [
  { out: 'sun', url: `${SSS}/2k_sun.jpg`, width: 2048 },
  { out: 'mercury', url: `${SSS}/8k_mercury.jpg`, width: 2048 },
  { out: 'venus', url: `${SSS}/4k_venus_atmosphere.jpg`, width: 2048 },
  { out: 'earth-day', url: `${SSS}/8k_earth_daymap.jpg`, width: 8192, quality: 88 },
  {
    out: 'earth-night',
    url: 'https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg',
    width: 3600,
  },
  { out: 'earth-clouds', url: `${SSS}/8k_earth_clouds.jpg`, width: 4096, grey: true },
  { out: 'earth-normal', url: `${SSS}/8k_earth_normal_map.tif`, width: 4096, quality: 92 },
  { out: 'earth-ocean', url: `${SSS}/8k_earth_specular_map.tif`, width: 2048, grey: true },
  { out: 'moon', url: `${MOON_KIT}/lroc_color_poles_4k.tif`, width: 4096 },
  { out: 'mars', url: `${SSS}/8k_mars.jpg`, width: 4096 },
  { out: 'jupiter', url: `${SSS}/8k_jupiter.jpg`, width: 4096 },
  { out: 'saturn', url: `${SSS}/8k_saturn.jpg`, width: 2048 },
  { out: 'saturn-ring', url: `${SSS}/8k_saturn_ring_alpha.png`, width: 2048, alpha: true },
  { out: 'uranus', url: `${SSS}/2k_uranus.jpg`, width: 2048 },
  { out: 'neptune', url: `${SSS}/2k_neptune.jpg`, width: 2048 },
  { out: 'stars', url: `${SSS}/8k_stars_milky_way.jpg`, width: 4096, quality: 80 },
]

async function cached(url: string): Promise<string> {
  const file = `${CACHE}/${url.split('/').pop()}`
  try {
    await stat(file)
  } catch {
    console.log(`download ${url}`)
    const res = await fetch(url)
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) {
      throw new Error(`${url}: ${res.status} ${res.headers.get('content-type')}`)
    }
    await writeFile(file, Buffer.from(await res.arrayBuffer()))
  }
  return file
}

await mkdir(CACHE, { recursive: true })
await mkdir(OUT, { recursive: true })
let total = 0
for (const t of TEXTURES) {
  const src = await cached(t.url)
  // The ring strip is 8192×500: scale its length only.
  const resize = t.alpha ? { width: t.width, height: 128, fit: 'fill' as const } : { width: t.width }
  let img = sharp(src, { limitInputPixels: false }).resize(resize)
  if (t.grey) img = img.greyscale()
  if (!t.alpha) img = img.removeAlpha()
  const file = `${OUT}/${t.out}.webp`
  await img
    .webp({ quality: t.quality ?? 84, effort: 6, alphaQuality: 100 })
    .toFile(file)
  const { size } = await stat(file)
  total += size
  console.log(`${file.padEnd(32)} ${(size / 1024).toFixed(0).padStart(6)} KB`)
}
console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB`)
