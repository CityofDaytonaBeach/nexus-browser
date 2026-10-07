import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

type Event = {
  time: string;
  title: string;
  place: string;
  tone: string;
};

const events: Event[] = [
  {time: '9:00 AM', title: 'Beachside Rally Kickoff', place: 'Daytona Boardwalk', tone: 'Oceanfront roll-in'},
  {time: '12:30 PM', title: 'Main Street Bike Show', place: 'Main Street Station', tone: 'Custom chrome judging'},
  {time: '4:00 PM', title: 'Scenic Loop Ride', place: 'Ormond Loop trailhead', tone: 'Marsh roads and live oaks'},
  {time: '8:00 PM', title: 'Throttle Night Concert', place: 'Riverfront Stage', tone: 'Southern rock headliner'},
];

const lodging = ['Oceanfront rider rates', 'Trailer parking map', 'Late-night shuttle loop'];

function App() {
  const [rsvpName, setRsvpName] = useState('');
  const [selectedPass, setSelectedPass] = useState('Weekend rally pass');
  const [confirmation, setConfirmation] = useState('');

  function handleRsvp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = rsvpName.trim();
    if (!trimmedName) {
      setConfirmation('Enter your name to reserve a Bike Week pass.');
      return;
    }

    setConfirmation(`${trimmedName}, your ${selectedPass.toLowerCase()} is reserved for Daytona Bike Week.`);
  }

  return (
    <main>
      <section className="hero" aria-labelledby="page-title">
        <nav className="topbar" aria-label="Primary navigation">
          <a className="brand" href="#page-title" aria-label="Daytona Bike Week home">
            <span className="brand-mark" aria-hidden="true">BW</span>
            <span>Daytona Bike Week</span>
          </a>
          <div className="nav-links">
            <a href="#schedule">Schedule</a>
            <a href="#ride-plan">Ride Plan</a>
            <a href="#passes">Passes</a>
          </div>
        </nav>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">March rally week • Daytona Beach</p>
            <h1 id="page-title">Ride into the loudest week on the Atlantic coast.</h1>
            <p className="hero-lede">
              A focused landing page for Daytona Bike Week visitors: daily ride highlights, venue stops, lodging help,
              and a local pass reservation flow that works before the engines start.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#passes">Reserve a pass</a>
              <a className="button button-secondary" href="#schedule">View schedule</a>
            </div>
          </div>

          <aside className="rally-card" aria-label="Featured rally details">
            <p className="card-kicker">Featured Route</p>
            <h2>Boardwalk to Ormond Loop</h2>
            <dl>
              <div><dt>Distance</dt><dd>38 miles</dd></div>
              <div><dt>Best Start</dt><dd>4:00 PM</dd></div>
              <div><dt>Meetup</dt><dd>Main Street Station</dd></div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="strip" aria-label="Rally quick facts">
        <div><strong>500k+</strong><span>annual visitors</span></div>
        <div><strong>10 days</strong><span>rides, shows, concerts</span></div>
        <div><strong>Local-first</strong><span>venues and travel tips</span></div>
      </section>

      <section className="content-grid" id="schedule" aria-labelledby="schedule-title">
        <div className="section-copy">
          <p className="eyebrow">Today’s line-up</p>
          <h2 id="schedule-title">Build a day around rides, chrome, and music.</h2>
          <p>Every stop includes a clear time, place, and reason to go so visitors can choose the right kind of Bike Week energy.</p>
        </div>
        <div className="timeline">
          {events.map((item) => (
            <article className="event-card" key={item.title}>
              <span>{item.time}</span>
              <h3>{item.title}</h3>
              <p>{item.place}</p>
              <small>{item.tone}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="ride-plan" id="ride-plan" aria-labelledby="ride-plan-title">
        <div>
          <p className="eyebrow">Rider services</p>
          <h2 id="ride-plan-title">Arrive with the practical stuff handled.</h2>
        </div>
        <ul>
          {lodging.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section className="passes" id="passes" aria-labelledby="passes-title">
        <div className="pass-copy">
          <p className="eyebrow">Pass reservation</p>
          <h2 id="passes-title">Save your Bike Week starting point.</h2>
          <p>Use local test data only: this form creates an on-page reservation confirmation and does not send messages or process payments.</p>
        </div>
        <form className="rsvp-form" onSubmit={handleRsvp}>
          <label htmlFor="rsvp-name">Rider name</label>
          <input
            id="rsvp-name"
            name="rider-name"
            type="text"
            value={rsvpName}
            onChange={(event) => setRsvpName(event.target.value)}
            placeholder="Alex Rider"
          />

          <label htmlFor="pass-type">Pass type</label>
          <select id="pass-type" value={selectedPass} onChange={(event) => setSelectedPass(event.target.value)}>
            <option>Weekend rally pass</option>
            <option>Main Street bike show pass</option>
            <option>Scenic loop ride pass</option>
          </select>

          <button className="button button-primary" type="submit">Reserve pass</button>
          <p className="confirmation" role="status" aria-live="polite">{confirmation}</p>
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<App />);
