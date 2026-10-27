// Picks one Start word per visit from the "|"-separated list in the dictionary.
export function pickStartWord(list: string, random: () => number = Math.random): string {
  const words = list
    .split('|')
    .map((w) => w.trim())
    .filter(Boolean)
  return words[Math.floor(random() * words.length)] ?? ''
}
