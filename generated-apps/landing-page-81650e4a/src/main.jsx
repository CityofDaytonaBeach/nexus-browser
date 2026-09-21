import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const rideStops = [
  {
    id: 'main-street',
    label: 'Main Street Rally Row',
    time: '10:00 AM',
    miles: 0,
    note: 'Park once, walk the vendor blocks, catch the stunt demos, and fuel up before the loop.',
  },
  {
    id: 'speedway',
    label: 'Daytona International Speedway',
    time: '1:30 PM',
    miles: 5.8,
    note: 'Demo rides, merch tents, manufacturer activations, and a photo stop by the grandstands.',
  },
  {
    id: 'ormond',
    label: 'Ormond Scenic Loop',
    time: '4:15 PM',
    miles: 24.3,
    note: 'A shaded coastal ride with oak canopy, bridge views, and slower sweepers.',
  },
  {
    id: 'beach',
    label: 'Beachfront Neon Run',
    time: '7:45 PM',
    miles: 31.7,
    note: 'Golden-hour cruise back to the oceanfront for live music and night-market food trucks.',
  },
];

const schedule = [
  ['Fri', 'Opening Thunder', 'Main Street parade, custom bike roll-in, welcome concert'],
  ['Sat', 'Speedway Sessions', 'Factory demo rides, vintage race showcase, vendor expo'],
  ['Sun', 'Coastal Loop Day', 'Guided scenic rides, brunch stops, oceanfront meetups'],
  ['Mon', 'Builder Night', 'Custom paint awards, garage talks, after-dark block party'],
];

const stats = [
  ['10 days', 'rallies, rides, concerts, and coastal meetups'],
  ['31.7 mi', 'featured loop from Main Street to oceanfront'],
  ['4 zones', 'street, speedway, scenic loop, beachfront'],
];

function App() {
  const [selectedStop, setSelectedStop] = useState(rideStops[0]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus('ready'), 650);
    return () => window.clearTimeout(timer);
  }, []);

  const handlePlannerSubmit = (event) => {
    event.preventDefault();
    setStatus('saved');
    window.setTimeout(() => setStatus('ready'), 1800);
  };

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="#hero" aria-label="Daytona Bike Week home">
          <span>DBW</span>
          <strong>Daytona Bike Week</strong>
        </a>
        <div className="nav-links">
          <a href="#route">Ride route</a>
          <a href="#schedule">Schedule</a>
          <a href="#planner">Planner</a>
        </div>
        <a className="ticket-button" href="#planner">Build My Ride</a>
      </nav>

      <section className="hero" id="hero">
        <div className="hero-copy">
          <p className="eyebrow">March 1-10 / Daytona Beach, Florida</p>
          <h1>Ten days of coastal roads, chrome, concerts, and speedway thunder.</h1>
          <p className="hero-text">
            A high-octane landing page for Daytona Bike Week, built around practical trip planning: where to ride, what to catch, and how to move from Main Street to the Speedway without losing the day.
          </p>
          <div className="hero-actions">
            <a href="#planner" className="primary-action">Start the ride plan</a>
            <a href="#schedule" className="secondary-action">View event lineup</a>
          </div>
        </div>

        <aside className="hero-card" aria-label="Featured route summary">
          <div className="sun-badge">A1A</div>
          <p>Featured loop</p>
          <strong>Main Street to Ormond Scenic Loop</strong>
          <div className="gauge" aria-hidden="true"><span /></div>
          <dl>
            <div><dt>Start</dt><dd>10:00 AM</dd></div>
            <div><dt>Distance</dt><dd>31.7 mi</dd></div>
            <div><dt>Finish</dt><dd>Beachfront</dd></div>
          </dl>
        </aside>
      </section>

      <section className="stats-strip" aria-label="Event highlights">
        {stats.map(([value, label]) => (
          <article key={value}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="route-section" id="route">
        <div className="section-heading">
          <p className="eyebrow">Ride intelligence</p>
          <h2>Pick a stop and preview the day like a local.</h2>
        </div>
        <div className="route-grid">
          <div className="route-map" aria-label="Interactive Daytona Bike Week route stops">
            {rideStops.map((stop, index) => (
              <button
                key={stop.id}
                className={selectedStop.id === stop.id ? 'route-stop active' : 'route-stop'}
                style={{ '--x': `${14 + index * 25}%`, '--y': `${70 - index * 17}%` }}
                onClick={() => setSelectedStop(stop)}
                aria-pressed={selectedStop.id === stop.id}
              >
                <span>{index + 1}</span>
                {stop.label}
              </button>
            ))}
            <div className="route-line" aria-hidden="true" />
          </div>
          <article className="stop-card">
            <span>{selectedStop.time}</span>
            <h3>{selectedStop.label}</h3>
            <p>{selectedStop.note}</p>
            <dl>
              <div><dt>Miles from start</dt><dd>{selectedStop.miles}</dd></div>
              <div><dt>Ride mode</dt><dd>{selectedStop.id === 'ormond' ? 'Scenic' : 'Rally'}</dd></div>
            </dl>
          </article>
        </div>
      </section>

      <section className="schedule-section" id="schedule">
        <div className="section-heading inverted">
          <p className="eyebrow">Event rhythm</p>
          <h2>Built for riders who want more than a poster.</h2>
        </div>
        <div className="schedule-list">
          {schedule.map(([day, title, detail]) => (
            <article key={title}>
              <span>{day}</span>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="planner-section" id="planner">
        <div>
          <p className="eyebrow">Trip builder</p>
          <h2>Reserve your rally day around your riding style.</h2>
          <p>
            This demo includes real app states: loading route data, successful save feedback, keyboard-focusable controls, responsive stacking, and practical form fields for a rider landing page.
          </p>
        </div>
        <form className="planner-card" onSubmit={handlePlannerSubmit}>
          <label>
            Riding style
            <select name="style" defaultValue="scenic">
              <option value="scenic">Scenic coastal loop</option>
              <option value="speedway">Speedway and demo rides</option>
              <option value="nightlife">Main Street nightlife</option>
            </select>
          </label>
          <label>
            Arrival window
            <select name="arrival" defaultValue="morning">
              <option value="morning">Morning roll-in</option>
              <option value="afternoon">Afternoon cruise</option>
              <option value="night">After-dark ride</option>
            </select>
          </label>
          <label>
            Email for route notes
            <input type="email" placeholder="rider@example.com" aria-describedby="planner-state" />
          </label>
          <button type="submit">Save my ride plan</button>
          <p id="planner-state" className={`state-message ${status}`} role="status" aria-live="polite">
            {status === 'loading' && 'Loading current route windows...'}
            {status === 'ready' && 'Route planner ready. No email is sent in this demo.'}
            {status === 'saved' && 'Ride plan saved locally for preview.'}
          </p>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
