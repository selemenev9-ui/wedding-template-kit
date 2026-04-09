# OG Image Policy (Do Not Break)

## Master asset

- `public/og.webp` is the approved master Open Graph image for production.
- Do not overwrite or regenerate `public/og.webp` during experiments.

## Variants

- Use separate files for tests/experiments, for example:
  - `public/og-telegram.webp`
  - `public/og-variant-*.webp`
- Keep `og.webp` untouched unless explicitly approved by the project owner.

## Cache-busting workflow

- If preview cache must be refreshed, update only the query version in meta tags:
  - `https://katyartemwedding.ru/og.webp?v=<n>`
- Do not swap the master image file for cache invalidation.

## Rollback safety

- Keep `public/og-original.webp` as immutable backup source.
- Any OG updates must preserve:
  - dimensions `1200x630`
  - stable typography composition
  - visual parity with approved brand style
