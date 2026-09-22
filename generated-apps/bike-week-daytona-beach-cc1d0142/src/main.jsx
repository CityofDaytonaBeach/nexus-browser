import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { essentials, events, filters, routes, stats, venues } from './app-data.js';
import './styles.css';

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [savedEvents, setSavedEvents] = useState([]);
  const visibleEvents = activeFilter === 'All' ? events : events.filter((event) => event.type === activeFilter);

  function toggleSaved(title) {
    setSavedEvents((current) => current.includes(title) ? current.filter((event) => event !== title) : [...current, title]);
  }

  return (
    <main>
      <header className="hero" id="top">
        <nav className="topbar" aria-label="Primary navigation">
          <a href="#top" className="brand">Daytona Bike Week</a>
          <div>
            <a href="#schedule">Schedule</a>
            <a href="#routes">Routes</a>
            <a href="#venues">Venues</a>
          </div>
        </nav>

        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">March rally field guide</p>
            <h1>Ride the beach, the loop, and the loudest blocks in Daytona.</h1>
            <p className="lede">A mobile-first Bike Week planner for choosing the right ride, finding the next show, and keeping your crew synced from sunrise roll-in to last-call shuttle.</p>
            <div className="hero-actions">
              <a className="button primary" href="#schedule">Build today&apos;s plan</a>
              <a className="button secondary" href="#routes">Scout ride routes</a>
            </div>
          </div>

          <aside className="rally-card" aria-label="Rally status">
            <div className="status-line"><span></span> Live rally mode</div>
            <h2>Oceanfront window</h2>
            <p>Best riding before 11 AM. Afternoon thunder risk means keep the inland route and rain layer ready.</p>
            <dl>
              <div><dt>Heat index</dt><dd>84F</dd></div>
              <div><dt>Storm watch</dt><dd>3 PM</dd></div>
              <div><dt>Main St.</dt><dd>Busy</dd></div>
            </dl>
          </aside>
        </section>

        <section className="stats" aria-label="Planner statistics">
          {stats.map((item) => <div key={item.label}><strong>{item.value}</strong><span>{item.label}</span></div>)}
        </section>
      </header>

      <section className="section schedule" id="schedule">
        <div className="section-heading">
          <p className="eyebrow">Choose your pace</p>
          <h2>Today&apos;s ride board</h2>
          <p>Filter by what your group wants next. Save stops to the crew strip for a quick at-a-glance plan.</p>
        </div>

        <div className="filters" role="list" aria-label="Event filters">
          {filters.map((filter) => (
            <button key={filter} className={filter === activeFilter ? 'active' : ''} onClick={() => setActiveFilter(filter)} type="button">
              {filter}
            </button>
          ))}
        </div>

        <div className="event-grid">
          {visibleEvents.length ? visibleEvents.map((event) => {
            const isSaved = savedEvents.includes(event.title);
            return (
              <article className="event-card" key={event.title}>
                <div className="event-time">{event.time}</div>
                <div>
                  <span className="pill">{event.type}</span>
                  <h3>{event.title}</h3>
                  <p>{event.detail}</p>
                  <footer>
                    <span>{event.place}</span>
                    <button type="button" onClick={() => toggleSaved(event.title)} aria-pressed={isSaved}>{isSaved ? 'Saved' : 'Save stop'}</button>
                  </footer>
                </div>
              </article>
            );
          }) : <p className="empty-state">No stops match this filter yet. Try All or pick another category.</p>}
        </div>

        <aside className="crew-strip" aria-live="polite">
          <strong>Crew plan</strong>
          <span>{savedEvents.length ? savedEvents.join(' -> ') : 'Save a few stops to create a shared day plan.'}</span>
        </aside>
      </section>

      <section className="section route-section" id="routes">
        <div className="section-heading">
          <p className="eyebrow">Road feel matters</p>
          <h2>Three routes for three different moods</h2>
        </div>
        <div className="route-grid">
          {routes.map((route) => (
            <article className="route-card" key={route.name}>
              <div className="miles"><strong>{route.miles}</strong><span>mi</span></div>
              <h3>{route.name}</h3>
              <p>{route.mood}</p>
              <ol>
                {route.stops.map((stop) => <li key={stop}>{stop}</li>)}
              </ol>
            </article>
          ))}
        </div>
      </section>

      <section className="section split" id="venues">
        <div>
          <p className="eyebrow">Know before you park</p>
          <h2>Venue heat map</h2>
          <div className="venue-list">
            {venues.map((venue) => <article key={venue.name}><span>{venue.tag}</span><strong>{venue.name}</strong><em>{venue.level}</em></article>)}
          </div>
        </div>
        <div className="essentials">
          <h2>Rider essentials</h2>
          {essentials.map((item) => <p key={item}>{item}</p>)}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
