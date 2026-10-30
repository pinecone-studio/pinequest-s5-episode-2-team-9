// Line-art emblems for the library cards (drawn, not rendered, so cards stay light).
export function ModelGlyph({ id }: { id: string }) {
  if (id === 'atoms') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <ellipse className="glyph-main" cx="100" cy="100" rx="78" ry="28" />
        <ellipse className="glyph-main" cx="100" cy="100" rx="78" ry="28" transform="rotate(60 100 100)" />
        <ellipse className="glyph-accent" cx="100" cy="100" rx="78" ry="28" transform="rotate(-60 100 100)" />
        <circle className="glyph-dot" cx="100" cy="100" r="9" />
      </svg>
    )
  }
  if (id === 'solar') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <circle className="glyph-dot" cx="100" cy="100" r="14" />
        <ellipse className="glyph-sub" cx="100" cy="100" rx="42" ry="16" />
        <ellipse className="glyph-main" cx="100" cy="100" rx="66" ry="25" />
        <ellipse className="glyph-sub" cx="100" cy="100" rx="88" ry="34" />
        <circle className="glyph-accent" cx="160" cy="113" r="7" />
        <circle className="glyph-main" cx="57" cy="88" r="4" />
        <path className="glyph-accent" d="M154 98l12 30" />
      </svg>
    )
  }
  if (id === 'electromagnetism') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path className="glyph-accent" d="M100 26v148" />
        <ellipse className="glyph-main" cx="100" cy="100" rx="34" ry="12" />
        <ellipse className="glyph-sub" cx="100" cy="100" rx="58" ry="22" />
        <ellipse className="glyph-sub" cx="100" cy="100" rx="82" ry="32" />
        <path className="glyph-accent" d="M92 38l8-12 8 12" />
        <circle className="glyph-dot" cx="100" cy="100" r="5" />
      </svg>
    )
  }
  if (id === 'spacetime') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path
          className="glyph-sub"
          d="M24 70c40 0 56 40 76 40s36-40 76-40M24 130c40 0 56-40 76-40s36 40 76 40"
        />
        <path
          className="glyph-main"
          d="M60 30c0 40 30 50 40 70M140 30c0 40-30 50-40 70M60 170c0-40 30-50 40-70M140 170c0-40-30-50-40-70"
        />
        <circle className="glyph-dot" cx="100" cy="100" r="12" />
        <path className="glyph-accent" d="M36 40c30 10 46 34 52 52" />
      </svg>
    )
  }
  if (id === 'heart') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path
          className="glyph-main"
          d="M100 168c-38-24-66-52-66-86 0-22 16-38 36-38 13 0 24 7 30 18 6-11 17-18 30-18 20 0 36 16 36 38 0 34-28 62-66 86z"
        />
        <path className="glyph-sub" d="M100 62v104M70 60c10 18 18 36 30 44M130 60c-10 18-18 36-30 44" />
        <path
          className="glyph-accent"
          d="M86 44c0-14 4-24 10-28M108 44c2-12 8-22 16-26M74 48c-4-10-4-18 0-26"
        />
        <circle className="glyph-dot" cx="100" cy="104" r="4" />
      </svg>
    )
  }
  if (id === 'lungs') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path
          className="glyph-main"
          d="M86 62c-24-4-46 18-54 52-6 26-2 56 8 62 12 6 32-2 44-14 6-6 8-14 8-24V72c0-6-2-10-6-10z"
        />
        <path
          className="glyph-main"
          d="M114 62c24-4 46 18 54 52 6 26 2 56-8 62-12 6-32-2-44-14-6-6-8-14-8-24V72c0-6 2-10 6-10z"
        />
        <path className="glyph-accent" d="M100 22v58M100 80c-8 4-16 10-22 20M100 80c8 4 16 10 22 20" />
        <path
          className="glyph-sub"
          d="M92 34h16M92 46h16M92 58h16M78 100c-10 8-16 20-18 34M78 100c-2 14 0 30 6 42M122 100c10 8 16 20 18 34M122 100c2 14 0 30-6 42"
        />
        <circle className="glyph-dot" cx="100" cy="80" r="4" />
      </svg>
    )
  }
  if (id === 'skeleton') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <circle className="glyph-main" cx="100" cy="34" r="16" />
        <path className="glyph-accent" d="M100 50v74" />
        <path className="glyph-sub" d="M80 66c10 6 30 6 40 0M78 78c12 6 32 6 44 0M80 90c10 6 30 6 40 0" />
        <path
          className="glyph-main"
          d="M76 62l-18 44-6 30M124 62l18 44 6 30M84 128l-6 30-2 28M116 128l6 30 2 28M84 126h32"
        />
      </svg>
    )
  }
  if (id === 'muscles') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <circle className="glyph-sub" cx="100" cy="32" r="14" />
        <path
          className="glyph-main"
          d="M72 60c10-8 46-8 56 0l10 46c2 10-6 34-10 40M72 60l-10 46c-2 10 6 34 10 40"
        />
        <path className="glyph-accent" d="M88 70c4 20 4 40 0 56M112 70c-4 20-4 40 0 56" />
        <path className="glyph-main" d="M82 128c-4 20-2 40 0 58M118 128c4 20 2 40 0 58" />
      </svg>
    )
  }
  if (id === 'rocketEngine') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path className="glyph-sub" d="M70 30h60M86 30l-8 22M114 30l8 22" />
        <path
          className="glyph-main"
          d="M84 56c-6 10-6 24 0 34l6 10c-14 30-28 52-34 76h88c-6-24-20-46-34-76l6-10c6-10 6-24 0-34z"
        />
        <path className="glyph-accent" d="M58 150c28 6 56 6 84 0M66 126c22 5 46 5 68 0" />
        <circle className="glyph-dot" cx="100" cy="94" r="4" />
      </svg>
    )
  }
  if (id === 'electricMotor') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <rect className="glyph-main" x="50" y="60" width="90" height="80" rx="14" />
        <path className="glyph-sub" d="M140 86h14v28h-14M30 100h20M154 100h20" />
        <path
          className="glyph-accent"
          d="M70 76c12 8 12 40 0 48M90 76c12 8 12 40 0 48M110 76c12 8 12 40 0 48"
        />
        <circle className="glyph-dot" cx="164" cy="100" r="4" />
      </svg>
    )
  }
  if (id === 'computer') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <rect className="glyph-main" x="58" y="34" width="84" height="132" rx="6" />
        <rect className="glyph-sub" x="68" y="48" width="64" height="104" rx="3" />
        <rect className="glyph-accent" x="78" y="60" width="44" height="22" rx="3" />
        <path className="glyph-sub" d="M78 96h44M78 110h44M78 124h30" />
        <circle className="glyph-dot" cx="100" cy="146" r="5" />
        <path className="glyph-main" d="M142 58h14M142 72h14" />
      </svg>
    )
  }
  if (id === 'brain') {
    return (
      <svg viewBox="0 0 200 200" className="glyph">
        <path
          className="glyph-main"
          d="M100 46c-12-10-34-8-42 6-16 2-26 18-20 34-10 12-6 32 10 38 2 16 18 26 34 20 6 8 12 10 18 8V46z"
        />
        <path
          className="glyph-main"
          d="M100 46c12-10 34-8 42 6 16 2 26 18 20 34 10 12 6 32-10 38-2 16-18 26-34 20-6 8-12 10-18 8"
        />
        <path
          className="glyph-sub"
          d="M70 70c10 4 14 14 10 24M130 70c-10 4-14 14-10 24M60 104c14-2 22 6 24 16M140 104c-14-2-22 6-24 16"
        />
        <path className="glyph-accent" d="M96 152c0 10 2 18 8 26" />
        <circle className="glyph-dot" cx="100" cy="100" r="4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 200 200" className="glyph">
      <rect className="glyph-main" x="40" y="70" width="120" height="42" rx="8" />
      <rect className="glyph-accent" x="58" y="52" width="34" height="18" rx="4" />
      <path className="glyph-sub" d="M156 80h10v22h-10" />
      <path
        className="glyph-main"
        d="M58 112l-14 26 14 26M78 112l-14 26 14 26M126 112l-14 26 14 26M146 112l-14 26 14 26"
      />
      <circle className="glyph-dot" cx="58" cy="112" r="4" />
      <circle className="glyph-dot" cx="146" cy="112" r="4" />
    </svg>
  )
}
