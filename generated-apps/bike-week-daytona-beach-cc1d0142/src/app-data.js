export const filters = ['All', 'Ride', 'Show', 'Food', 'Night'];

export const stats = [
  { value: '3', label: 'signature ride loops' },
  { value: '9', label: 'curated day stops' },
  { value: '24h', label: 'crew-ready planning' }
];

export const events = [
  {
    time: '8:00 AM',
    type: 'Ride',
    title: 'Sunrise A1A rollout',
    detail: 'Ease north while the beach road is still cool, clear, and camera-ready.',
    place: 'Daytona Beach Pier'
  },
  {
    time: '10:30 AM',
    type: 'Show',
    title: 'Chrome row walk-through',
    detail: 'Vendor builds, custom paint, and early crowd energy before the main drag packs in.',
    place: 'Main Street'
  },
  {
    time: '12:15 PM',
    type: 'Food',
    title: 'Sea wall lunch stop',
    detail: 'Fast parking, shaded tables, and a good reset before the afternoon loop.',
    place: 'Beach Street'
  },
  {
    time: '2:00 PM',
    type: 'Ride',
    title: 'The Loop shade run',
    detail: 'Canopy roads, water views, and fewer stoplights when the coast starts heating up.',
    place: 'Ormond Scenic Loop'
  },
  {
    time: '5:45 PM',
    type: 'Show',
    title: 'Bike row golden hour',
    detail: 'Best photo window for customs, crews, and the oceanfront roll-in.',
    place: 'Destination Daytona'
  },
  {
    time: '8:30 PM',
    type: 'Night',
    title: 'Main Street night block',
    detail: 'Loudest crowd window. Park early, walk the strip, and set a meetup point.',
    place: 'Main Street Station'
  }
];

export const routes = [
  {
    name: 'Oceanline Cruise',
    miles: '18',
    mood: 'Low-stress beach riding with steady views and easy turnouts.',
    stops: ['Daytona Beach Pier', 'A1A northbound', 'Ormond Beach overlook']
  },
  {
    name: 'The Loop',
    miles: '34',
    mood: 'Canopy shade, sweepers, marsh air, and the best mid-day temperature break.',
    stops: ['Beach Street', 'Tomoka State Park', 'Highbridge Road']
  },
  {
    name: 'Rally Core Hop',
    miles: '12',
    mood: 'Short urban hops between the busiest Bike Week venues.',
    stops: ['Main Street', 'International Speedway Blvd', 'Destination Daytona']
  }
];

export const venues = [
  { tag: 'Core', name: 'Main Street', level: 'High energy' },
  { tag: 'Cruise', name: 'A1A Beachfront', level: 'Scenic' },
  { tag: 'Meet', name: 'Destination Daytona', level: 'Vendor-heavy' },
  { tag: 'Reset', name: 'Beach Street', level: 'Easy parking' }
];

export const essentials = [
  'Set one crew meetup location before Main Street gets packed.',
  'Carry rain gear even on blue-sky mornings; afternoon cells build fast.',
  'Use the inland route when beach traffic stalls or storm clouds stack west.'
];

export default {
  "name": "bike-week-daytona-beach",
  "category": "Web App",
  "theme": {
    "accent": "#2ddcff",
    "ink": "#02111f",
    "paper": "#e8f7ff"
  },
  "signature": "Web App Command Surface",
  "metric": "07",
  "metricLabel": "live product systems",
  "primaryCta": "Run workflow",
  "pages": [
    {
      "id": "overview",
      "label": "Overview",
      "headline": "bike week Daytona beach",
      "summary": "A working web app experience generated from your request, focused on daytona, beach.",
      "features": [
        "Live product shell",
        "Responsive command flow",
        "Distinct visual system"
      ]
    },
    {
      "id": "builder",
      "label": "Builder",
      "headline": "Build and iterate web app screens",
      "summary": "Chat changes update the app structure, copy, visual direction, and implementation prompts without starting over.",
      "features": [
        "Conversation updates",
        "Agent handoff",
        "Preview-first QA"
      ]
    },
    {
      "id": "launch",
      "label": "Launch",
      "headline": "Production readiness board",
      "summary": "The app includes setup, staging, QA, accessibility, and deployment surfaces for the requested product.",
      "features": [
        "Health checks",
        "Creative QA",
        "Deployment checklist"
      ]
    }
  ],
  "featureDetails": [
    "Generated from prompt signals instead of a static template.",
    "Designed to change when you continue the conversation.",
    "Ready for OpenCode, Expert Router, Build Doctor, and Staging Studio."
  ],
  "workflow": [
    "Capture the product intent",
    "Generate real app files",
    "Preview in browser",
    "Update from chat",
    "Run staging and repair loops"
  ],
  "updates": [
    "use bluw",
    "shifted the rally interface to an electric coastal blue visual system"
  ]
};
