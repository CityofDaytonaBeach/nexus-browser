# Spokehaus Bike Landing Page

A Vite + React landing page for a premium bike brand with interactive model selection, ride-mode planning, responsive product sections, and accessible form controls.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## QA Checklist

- Desktop: verify hero, model tiles, live build sheet, route console, service proof, and reserve form render without overlap.
- Mobile: verify navigation wraps cleanly, CTAs remain visible, bike illustration scales, and sections stack in a readable order.
- Accessibility: tab through navigation, model buttons, ride-mode tabs, form fields, and submit button with visible focus states.
- Console: confirm there are no React or browser console errors during interactions.
- API/data flows: no external APIs or secrets are used; the demo form prevents submission and keeps all data local.
- Production: run `npm run build` and confirm Vite completes successfully.
