# Wedding Template Kit

Cinematic Three.js + GSAP wedding invitation template for premium event websites.

Live demo: https://selemenev9-ui.github.io/wedding-template-kit/  
Source: https://github.com/selemenev9-ui/wedding-template-kit

## Features

- Premium WebGL hero scene
- Scroll-based story choreography
- Interactive gallery ribbon
- RSVP flow with anti-spam guards
- URL personalization via `?guest=Name`
- Template-ready content map in `src/content.js`

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

Asset placeholders:

- hero/story placeholders: `public/placeholders/scroll-*.svg`
- gallery placeholder card: `public/placeholders/gallery-card.svg`

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

## Commercial Use

Recommended offer ladder:

- Basic template: $49-$79
- Pro setup/customization: $149-$299
- Full custom build: $600+

For launch materials, use:

- `docs/REDDIT_POST.md`
- `docs/LAUNCH_CHECKLIST.md`
- `docs/CLIENT_OFFER_TEMPLATE.md`
