export const bikes = [
  {
    id: 'metro',
    type: 'Fast city e-bike',
    name: 'Metro Comet',
    copy: 'A nimble step-through commuter with integrated lights, fenders, and enough boost for stop-start traffic.',
    range: '55 mi',
    weight: '39 lb',
    charge: '2.8 hr',
    price: '$2,180',
    accent: '#ff7a45',
    gradient: 'linear-gradient(135deg, #ffe7d8 0%, #ffae7b 52%, #e75f36 100%)',
  },
  {
    id: 'cargo',
    type: 'Compact cargo bike',
    name: 'Market Mule',
    copy: 'Short enough for apartment halls, tough enough for grocery hauls, kid seats, and awkward hardware-store runs.',
    range: '72 mi',
    weight: '51 lb',
    charge: '3.5 hr',
    price: '$3,240',
    accent: '#0f8b8d',
    gradient: 'linear-gradient(135deg, #d4f5f1 0%, #57c8bc 48%, #0f8b8d 100%)',
  },
  {
    id: 'gravel',
    type: 'All-road hybrid',
    name: 'Ridge Signal',
    copy: 'Drop-bar comfort, wider tires, and a quiet assist profile for riders who mix workdays with weekend dirt.',
    range: '64 mi',
    weight: '34 lb',
    charge: '3 hr',
    price: '$2,890',
    accent: '#6b5cff',
    gradient: 'linear-gradient(135deg, #ece9ff 0%, #9d91ff 48%, #5841d8 100%)',
  },
];

export const rideModes = [
  {
    id: 'commute',
    label: 'Commute',
    distance: '8.4 mi route',
    terrain: 'Bridge climb, protected lanes',
    promise: 'Arrive sweat-light with 38 mi of range left.',
  },
  {
    id: 'family',
    label: 'Family',
    distance: '5 stops',
    terrain: 'School, market, library',
    promise: 'Cargo stays stable below walking-speed turns.',
  },
  {
    id: 'weekend',
    label: 'Weekend',
    distance: '31 mi loop',
    terrain: 'Pavement, towpath, gravel',
    promise: 'Assist tapers naturally so the ride still feels like yours.',
  },
];

export const proof = [
  'Every bike leaves fitted, charged, and ready for your actual route.',
  'One-year tune plan includes mobile service inside city limits.',
  'Accessory installs happen before pickup, not after checkout.',
];

export const qaChecklist = [
  'Fluid layout from 320px phones to wide desktop displays.',
  'Navigation, cards, tabs, route console, and form stack without horizontal scroll.',
  'Large touch targets, visible focus rings, reduced-motion support, and readable contrast.',
];
