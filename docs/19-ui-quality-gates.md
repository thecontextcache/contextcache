# UI Quality Gates

This document defines mandatory checks for all UI PRs.

## Accessibility

- All text under 18px: contrast `>= 4.5:1`
- Large text / bold labels: contrast `>= 3:1`
- Focus indicators: contrast `>= 3:1`
- Keyboard support:
  - interactive elements reachable by `Tab`
  - `Enter/Space` activate controls
  - `Esc` closes dialogs/palettes

## Visual Consistency

- Use design tokens only (no one-off hex colors in components).
- Core radii/shadows follow system values.
- Avoid broad glassmorphism in app surfaces.
- Keep dense data views readable at 13-14px body sizes.

## Interaction

- Reduced motion support for major transitions.
- No heavy animations on high-frequency interactions.
- Loading/empty/error states present for every async screen.

## Performance

- No repeated forced reflow loops in hot paths.
- No unbounded timers without teardown.
- Brain graph:
  - p95 frame time `<= 33ms` target
  - no sustained long tasks `> 50ms`

## Review Checklist

- [ ] Visual tokens used consistently
- [ ] Keyboard path verified
- [ ] Contrast verified
- [ ] Responsive behavior verified at mobile and desktop
- [ ] No console errors
- [ ] Performance trace reviewed for changed interactive surfaces
