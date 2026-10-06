import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const schedule = [
  { day: 'Fri Mar 5', title: 'Main Street Thunder Roll-In', time: '4:00 PM', place: 'Main Street', tag: 'Kickoff' },
  { day: 'Sat Mar 6', title: 'Beachside Sunrise Ride', time: '7:30 AM', place: 'Ormond Loop', tag: 'Scenic' },
  { day: 'Tue Mar 9', title: 'Custom Builders Row', time: '12:00 PM', place: 'Speedway Midway', tag: 'Show' },
  { day: 'Thu Mar 11', title: 'Veterans Honor Lap', time: '10:00 AM', place: 'Ocean Center', tag: 'Parade' },
  { day: 'Fri Mar 12', title: 'Neon Night Rally', time: '8:30 PM', place: 'Boardwalk Stage', tag: 'Live music' },
];

const packages = [
  ['Day Pass', 'Single-day access to vendor rows, demo zones, and live stages.', '$39', 'Best for one perfect ride day.'],
  ['Rider Weekender', 'Three-day pass with reserved bike parking and guided ride check-in.', '$119', 'For riders chasing the busiest weekend.'],
  ['Full Throttle', 'All-week access, merch bundle, priority demo rides, and VIP viewing deck.', '$249', 'The full rally plan with priority access.'],
];

const roadTips = [
  ['Arrive early', 'Beachside lots fill before late morning on concert nights.'],
  ['Pack for swings', 'Expect salt air, hot pavement, and quick evening temperature drops.'],
  ['Ride the loop', 'Use Ormond Loop for a calm first mile before Main Street traffic.'],
];

function App() {
  const [registered, setRegistered] = useState(false);

  return (
    <>
      <header className="site-header" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Bike Week home">
          <span aria-hidden="true">BW</span> Bike Week
        </a>
        <nav>
          <a href="#schedule" aria-label="Schedule">Schedule</a>
          <a href="#passes">Passes</a>
          <a href="#roadbook" aria-label="Roadbook">Roadbook</a>
          <a href="#register">Register</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">March 5-14, 2027 / Daytona Beach, Florida</p>
            <h1 id="hero-title">Ten days of coastal rides, custom iron, and midnight throttle.</h1>
            <p className="hero-text">
              A rally landing page for riders planning Daytona Bike Week: sunrise loops, Speedway demos,
              builder showcases, Main Street nights, and beach concerts in one mobile-ready trip plan.
            </p>
            <div className="hero-actions">
              <a className="button primary" href="#register" aria-label="Reserve ride updates">Reserve ride updates</a>
              <a className="button ghost" href="#schedule" aria-label="View rally schedule">View rally schedule</a>
            </div>
            <div className="hero-stats" aria-label="Bike Week quick stats">
              <span><strong>10</strong> rally days</span>
              <span><strong>40+</strong> ride stops</span>
              <span><strong>3</strong> pass lanes</span>
            </div>
          </div>
          <div className="hero-card" aria-label="Featured rally details">
            <div className="tachometer" aria-hidden="true">
              <span>8.5k</span>
              <small>expected bikes</small>
            </div>
            <dl>
              <div><dt>Anchor route</dt><dd>Ormond Loop to A1A</dd></div>
              <div><dt>Main stage</dt><dd>Boardwalk Bandshell</dd></div>
              <div><dt>Vendor row</dt><dd>Daytona International Speedway</dd></div>
            </dl>
          </div>
        </section>

        <section className="strip" aria-label="Event highlights">
          <span>Guided rides</span>
          <span>Live builds</span>
          <span>Demo fleets</span>
          <span>Beach concerts</span>
        </section>

        <section className="section grid-two" id="schedule" aria-labelledby="schedule-title">
          <div>
            <p className="eyebrow">Rally Lineup</p>
            <h2 id="schedule-title">Make every day a different kind of ride.</h2>
            <p>
              The calendar balances early coastal miles, afternoon shows, and after-dark Main Street energy so
              visitors can build a trip around how they actually ride.
            </p>
          </div>
          <div className="schedule-list">
            {schedule.map((item) => (
              <article className="schedule-card" key={item.title}>
                <div>
                  <strong>{item.day}</strong>
                  <span>{item.time}</span>
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>{item.place}</p>
                </div>
                <span className="tag">{item.tag}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section passes" id="passes" aria-labelledby="passes-title">
          <p className="eyebrow">Passes</p>
          <h2 id="passes-title">Choose your lane.</h2>
          <div className="pass-grid">
            {packages.map(([name, description, price, note]) => (
              <article className="pass-card" key={name}>
                <h3>{name}</h3>
                <p>{description}</p>
                <strong>{price}</strong>
                <span>{note}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="section roadbook" id="roadbook" aria-labelledby="roadbook-title">
          <div className="roadbook-copy">
            <p className="eyebrow">Roadbook</p>
            <h2 id="roadbook-title">Built for riders before they hit town.</h2>
            <p>
              Keep the landing page useful beyond the first click with practical trip guidance: parking timing,
              route selection, and weather-aware packing notes.
            </p>
          </div>
          <div className="tip-grid">
            {roadTips.map(([title, copy]) => (
              <article className="tip-card" key={title}>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section register" id="register" aria-labelledby="register-title">
          <div>
            <p className="eyebrow">Ride Alert List</p>
            <h2 id="register-title">Get the route drops before the pack leaves.</h2>
            <p>
              Join the local update list for schedule changes, parking maps, weather calls, and last-minute
              hosted rides. This demo keeps registration local and does not send messages.
            </p>
          </div>
          <form
            aria-label="Reserve ride updates"
            onSubmit={(event) => {
              event.preventDefault();
              setRegistered(true);
            }}
          >
            <label htmlFor="rider-name">Rider name</label>
            <input id="rider-name" name="riderName" placeholder="Alex Rider" required />

            <label htmlFor="ride-style">Ride style</label>
            <select id="ride-style" name="rideStyle" defaultValue="">
              <option value="" disabled>Pick a ride style</option>
              <option>Touring</option>
              <option>Cruiser</option>
              <option>Sport</option>
              <option>Custom build</option>
            </select>

            <button className="button primary" type="submit">Join ride alert list</button>
            {registered && <p className="success" role="status">Ride alert reserved. Check-in opens on Main Street.</p>}
          </form>
        </section>
      </main>

      <footer>
        <strong>Bike Week 2027</strong>
        <span>Built for rally planning, ticket interest, and mobile trip discovery.</span>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
