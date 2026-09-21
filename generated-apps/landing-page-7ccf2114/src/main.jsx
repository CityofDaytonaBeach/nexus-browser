import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bikes, proof, qaChecklist, rideModes } from './app-data.js';
import './styles.css';

function App() {
  const [selectedBikeId, setSelectedBikeId] = useState(bikes[0].id);
  const [selectedModeId, setSelectedModeId] = useState(rideModes[0].id);
  const selectedBike = bikes.find((bike) => bike.id === selectedBikeId) || bikes[0];
  const selectedMode = rideModes.find((mode) => mode.id === selectedModeId) || rideModes[0];

  return (
    <main className="site-shell" style={{ '--bike-accent': selectedBike.accent }}>
      <header className="nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Spokehaus home">
          <span>SH</span>
          Spokehaus
        </a>
        <nav className="nav-links">
          <a href="#models">Models</a>
          <a href="#ride-lab">Ride Lab</a>
          <a href="#service">Service</a>
        </nav>
        <a className="nav-cta" href="#reserve">Book a test ride</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">City bikes without the car-brain</p>
          <h1>Purpose-built bikes for the routes you actually ride.</h1>
          <p className="hero-text">
            Spokehaus pairs lightweight frames, practical cargo systems, and live route planning so commuters,
            parents, and weekend riders can replace more short trips with two wheels.
          </p>
          <div className="hero-actions">
            <a className="button primary" href="#reserve">Reserve a fitting</a>
            <a className="button secondary" href="#ride-lab">Plan my route</a>
          </div>
          <dl className="hero-stats" aria-label="Launch metrics">
            <div><dt>4.9/5</dt><dd>owner rating</dd></div>
            <div><dt>18 min</dt><dd>avg trip saved</dd></div>
            <div><dt>0</dt><dd>assembly guesswork</dd></div>
          </dl>
        </div>

        <aside className="bike-card" aria-label={`${selectedBike.name} feature card`}>
          <div className="bike-stage" style={{ background: selectedBike.gradient }}>
            <div className="bike-visual" aria-hidden="true">
              <span className="wheel rear"></span>
              <span className="wheel front"></span>
              <span className="frame top"></span>
              <span className="frame down"></span>
              <span className="frame fork"></span>
              <span className="frame seat"></span>
              <span className="bar"></span>
              <span className="rack"></span>
            </div>
          </div>
          <div className="bike-card-body">
            <p>{selectedBike.type}</p>
            <h2>{selectedBike.name}</h2>
            <span>{selectedBike.price}</span>
          </div>
        </aside>
      </section>

      <section className="model-section" id="models" aria-labelledby="models-heading">
        <div className="section-heading">
          <p className="eyebrow">Choose your geometry</p>
          <h2 id="models-heading">Three bikes, one honest fit process.</h2>
        </div>
        <div className="model-grid" role="list">
          {bikes.map((bike) => (
            <button
              className={`model-tile ${bike.id === selectedBike.id ? 'active' : ''}`}
              key={bike.id}
              onClick={() => setSelectedBikeId(bike.id)}
              style={{ '--tile-accent': bike.accent }}
              type="button"
            >
              <span>{bike.type}</span>
              <strong>{bike.name}</strong>
              <p>{bike.copy}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="spec-panel" aria-label={`${selectedBike.name} specifications`}>
        <div>
          <p className="eyebrow">Live build sheet</p>
          <h2>{selectedBike.name} details</h2>
          <p>{selectedBike.copy}</p>
        </div>
        <dl className="spec-grid">
          <div><dt>Range</dt><dd>{selectedBike.range}</dd></div>
          <div><dt>Weight</dt><dd>{selectedBike.weight}</dd></div>
          <div><dt>Charge</dt><dd>{selectedBike.charge}</dd></div>
          <div><dt>From</dt><dd>{selectedBike.price}</dd></div>
        </dl>
      </section>

      <section className="ride-lab" id="ride-lab" aria-labelledby="ride-heading">
        <div className="ride-copy">
          <p className="eyebrow">Ride Lab</p>
          <h2 id="ride-heading">Match the bike to a real day, not a showroom fantasy.</h2>
          <p>
            Toggle a route profile and the landing page behaves like a useful buying guide: range, terrain, and the
            first outcome are visible before anyone fills out a form.
          </p>
        </div>
        <div className="route-console">
          <div className="mode-tabs" role="tablist" aria-label="Ride mode presets">
            {rideModes.map((mode) => (
              <button
                aria-selected={mode.id === selectedMode.id}
                className={mode.id === selectedMode.id ? 'active' : ''}
                key={mode.id}
                onClick={() => setSelectedModeId(mode.id)}
                role="tab"
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="route-map" role="tabpanel">
            <span className="route-line"></span>
            <span className="pin start">Home</span>
            <span className="pin finish">Arrive</span>
          </div>
          <div className="route-details">
            <span>{selectedMode.distance}</span>
            <span>{selectedMode.terrain}</span>
            <strong>{selectedMode.promise}</strong>
          </div>
        </div>
      </section>

      <section className="service" id="service" aria-label="Service promises">
        {proof.map((item) => (
          <article key={item}>
            <span aria-hidden="true">✓</span>
            <p>{item}</p>
          </article>
        ))}
      </section>

      <section className="reserve" id="reserve" aria-labelledby="reserve-heading">
        <div>
          <p className="eyebrow">No-pressure buying</p>
          <h2 id="reserve-heading">Book a fit session with your route already loaded.</h2>
          <p>
            Bring your commute, school run, or favorite loop. We set saddle height, cargo needs, and range settings
            before the test ride starts.
          </p>
        </div>
        <form className="signup" aria-label="Test ride request form" onSubmit={(event) => event.preventDefault()}>
          <label>
            Email
            <input type="email" placeholder="rider@example.com" required />
          </label>
          <label>
            Main ride need
            <select defaultValue="commute">
              <option value="commute">Daily commute</option>
              <option value="cargo">Cargo and family trips</option>
              <option value="weekend">Weekend distance rides</option>
            </select>
          </label>
          <button type="submit">Request test ride</button>
          <p className="form-note">Demo form only. No data leaves this browser.</p>
        </form>
      </section>

      <section className="qa-panel" aria-label="QA checklist">
        <h2>Build QA checklist</h2>
        <ul>
          {qaChecklist.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
