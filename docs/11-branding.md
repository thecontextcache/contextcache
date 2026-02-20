# Branding Guidelines

## Wordmark

- Primary brand text: `thecontextcache™`
- Keep the ™ symbol visible in app header, landing, and legal surfaces.
- Use lower-case spelling exactly as above.

## Logo system

- Header logo: compact neural/interlocking-C glyph before the wordmark.
- Minimum size:
  - Header icon: `20px`
  - Favicon: `32x32` SVG
- Theme-aware colors:
  - Dark UI: cyan/violet glow
  - Light UI: teal/indigo contrast

## Theme-dependent assets

- Favicons:
  - `/favicon-dark.svg`
  - `/favicon-light.svg`
- Runtime behavior:
  - Theme provider updates `<link id="dynamic-favicon">` whenever theme changes.
  - Layout boot script sets favicon before first paint.
  - Cache busting uses `NEXT_PUBLIC_ASSET_VERSION` query suffix.

## Placement rules

- Top-left nav: `logo + wordmark` (never wordmark-only in app shell).
- Keep horizontal spacing at `8px` between icon and text.
- Avoid stretching or recoloring the logo outside the theme tokens.

## Typography

- Product name in nav and legal: `thecontextcache™`
- Headline style uses display font tokens from `globals.css`.
- Monospace labels are reserved for technical chips and metadata only.

## Accessibility

- Maintain WCAG AA contrast for logo and wordmark in both themes.
- Favicon variants should remain distinguishable against browser tab backgrounds.
