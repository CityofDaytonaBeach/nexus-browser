# Daytona Bike Week Landing Page

Polished Vite/React landing page for a Daytona Bike Week event experience. The page includes a large editorial hero, interactive ride-route planner, schedule highlights, responsive mobile layout, accessible controls, and simulated loading/saved planner states.

## Run Locally

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run preview
```

## QA Checklist

- Desktop: verify hero, sticky navigation, route map, schedule cards, and planner layout at wide viewport sizes.
- Mobile: verify navigation compacts, CTA buttons stack, route stops become a vertical touch-friendly list, and forms remain usable.
- Console: confirm there are no React/runtime errors in browser devtools.
- API/data flows: no external API or secret-backed service is used; planner state is local UI feedback only.
- Accessibility: tab through links, route-stop buttons, selects, email input, and submit button; confirm visible focus styles and live status text.
- Production build: run `npm run build` and confirm Vite completes successfully.
