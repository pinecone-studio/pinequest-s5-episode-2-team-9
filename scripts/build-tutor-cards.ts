// Copies the tutor models' study-card texts (EN + MN) into api/_lib/tutor/cards.ts.
// Run after changing part texts in src/i18n; scripts/tutorCards.test.ts fails while it is stale.
//
// Usage: npx tsx scripts/build-tutor-cards.ts
import { writeFileSync } from 'node:fs'
import { buildTutorCards, renderTutorCards } from './lib/tutorCards'

const file = 'api/_lib/tutor/cards.ts'
writeFileSync(file, renderTutorCards(buildTutorCards()))
console.log(`Wrote ${file}`)
