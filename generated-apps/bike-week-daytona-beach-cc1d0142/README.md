# Daytona Bike Week Planner

A polished React/Vite event-planning experience for Bike Week Daytona Beach. It includes a rally-style landing page, event filtering, saved crew plan state, route cards, venue guidance, weather/safety notes, and responsive mobile behavior.

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## QA Checklist

- Desktop: hero, rally status card, schedule, routes, and venue sections fit without horizontal scrolling.
- Mobile: navigation stacks, cards collapse to one column, and the sticky crew plan remains readable.
- Interaction: category filters update the event list, and Save stop toggles items in the crew plan.
- Accessibility: keyboard focus is visible on links and buttons, aria-pressed reflects saved stops, and semantic headings/sections are used.
- Console/build: production build completes with `npm run build`; no secrets or external APIs are required.
