# Daytona Bike Week Landing Page

React + Vite app for a Daytona Bike Week visitor landing page. It presents rally highlights, daily events, rider services, and a local-only pass reservation confirmation flow.

## Setup

```bash
npm install
```

## Run Locally

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

## Production Check

```bash
npm run build
npm test -- --runInBand
```

## QA Checklist

- Desktop: hero, navigation anchors, schedule cards, rider services, and RSVP form render without overflow.
- Mobile: top navigation wraps, hero stacks, schedule and pass form remain readable and touch-friendly.
- Interaction: entering a rider name and choosing a pass displays an on-page reservation confirmation.
- Runtime: browser console should be free of React/Vite errors.
- Production: `npm run build` completes and the contract/test data stays aligned with the UI.
