# Wedding Template Kit

Cinematic Three.js + GSAP wedding invitation template.

## Features

- Premium WebGL hero scene
- Scroll-based story choreography
- Interactive gallery ribbon
- RSVP flow with anti-spam guards
- URL personalization via `?guest=Name`

## Quick Start

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Customize Content

Edit only `src/content.js`:

- names
- date
- venue/address
- section labels and CTA text

## RSVP Setup

Create local `.env` from `.env.example`:

```env
VITE_TG_BOT_TOKEN=your_token
VITE_TG_CHAT_ID=your_chat_id
```

For static hosting, these values are embedded at build time.

## Deploy (GitHub Pages via `gh-pages`)

1. Build: `npm run build`
2. Publish `dist` to your Pages branch (`gh-pages`)
3. Ensure Pages source points to `gh-pages / (root)`
