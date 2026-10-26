import type { ModelId } from '../models/ModelDefinition'

// Line-art emblems for the library cards (drawn, not rendered, so cards stay light).
export function ModelGlyph({ id }: { id: ModelId }) {
  if (id === 'heart') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path className="glyph-main" d="M100 168c-38-24-66-52-66-86 0-22 16-38 36-38 13 0 24 7 30 18 6-11 17-18 30-18 20 0 36 16 36 38 0 34-28 62-66 86z" />
        <path className="glyph-sub" d="M100 62v104M70 60c10 18 18 36 30 44M130 60c-10 18-18 36-30 44" />
        <path className="glyph-accent" d="M86 44c0-14 4-24 10-28M108 44c2-12 8-22 16-26M74 48c-4-10-4-18 0-26" />
        <circle className="glyph-dot" cx="100" cy="104" r="4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 200" className="glyph">
      <rect className="glyph-main" x="40" y="70" width="120" height="42" rx="8" />
      <rect className="glyph-accent" x="58" y="52" width="34" height="18" rx="4" />
      <path className="glyph-sub" d="M156 80h10v22h-10" />
      <path className="glyph-main" d="M58 112l-14 26 14 26M78 112l-14 26 14 26M126 112l-14 26 14 26M146 112l-14 26 14 26" />
      <circle className="glyph-dot" cx="58" cy="112" r="4" />
      <circle className="glyph-dot" cx="146" cy="112" r="4" />
    </svg>
  )
}
