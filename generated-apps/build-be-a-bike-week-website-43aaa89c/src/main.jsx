import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import data from './app-data.js';
import './styles.css';

function App() {
  const [orderStatus, setOrderStatus] = useState('');

  function handleOrder(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = new FormData(form).get('name')?.toString().trim();
    setOrderStatus(
      name ? `Sweet, ${name}. Your candy box request is on the counter.` : 'Your candy box request is on the counter.'
    );
    form.reset();
  }

  return (
    <main>
      <header className="hero" id="top">
        <nav className="nav" aria-label="Primary navigation">
          <a href="#top" className="brand">{data.shopName}</a>
          <a href="#shelves">Shelves</a>
          <a href="#boxes">Gift boxes</a>
          <a href="#order" className="navCta">Build a box</a>
        </nav>

        <section className="heroGrid" aria-labelledby="hero-title">
          <div className="heroCopy">
            <p className="kicker">{data.city} candy counter / {data.hours}</p>
            <h1 id="hero-title">Tiny sweets. Big sugar theater.</h1>
            <p className="tagline">{data.tagline}</p>
            <div className="actions">
              <a href="#order" className="button primary">Build a candy box</a>
              <a href="#shelves" className="button secondary">Browse the jars</a>
            </div>
          </div>

          <aside className="candyCard" aria-label="Featured candy box">
            <span className="candySwirl" aria-hidden="true"></span>
            <p className="cardLabel">Shop favorite</p>
            <h2>Rainbow Counter Box</h2>
            <p>Ten bright scoops, two fudge slabs, and a handwritten note tucked under the ribbon.</p>
          </aside>
        </section>
      </header>

      <section className="stats" aria-label="Shop highlights">
        {data.stats.map(([number, label]) => (
          <article key={label}>
            <strong>{number}</strong>
            <span>{label}</span>
          </article>
        ))}
      </section>

      <section className="section split" id="shelves">
        <div>
          <p className="kicker">Behind the glass</p>
          <h2>Pick from shelves that look like a storybook pantry.</h2>
          <p>Every jar is labeled by flavor, texture, and sweetness level so kids, grownups, and gift-givers can find the right treat fast.</p>
        </div>
        <div className="shelfList">
          {data.shelves.map((item) => (
            <article className="shelfItem" key={item.title}>
              <span className="flavorBadge">{item.code}</span>
              <div>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.details}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section boxes" id="boxes">
        <div className="boxIntro">
          <p className="kicker">Gift box menu</p>
          <h2>Choose a mood, then let the counter crew pack the color.</h2>
        </div>
        <div className="boxGrid">
          {data.boxes.map((box, index) => (
            <article key={box}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{box}</h3>
              <p>Includes a custom color palette, allergen note card, ribbon wrap, and pickup-ready shelf tag.</p>
            </article>
          ))}
        </div>
      </section>

      <section className="order" id="order">
        <div>
          <p className="kicker">Counter pickup</p>
          <h2>Tell us who the sweets are for.</h2>
          <p>Send a quick box request and the shop crew will prep a cheerful mix for birthdays, movie nights, thank-yous, or emergency candy drawers.</p>
        </div>
        <form onSubmit={handleOrder}>
          <label>
            Name
            <input type="text" name="name" placeholder="Your name" autoComplete="name" />
          </label>
          <label>
            Candy box style
            <select name="style" defaultValue="">
              <option value="" disabled>Choose one</option>
              <option>Mostly sour</option>
              <option>Chocolate-heavy</option>
              <option>Rainbow gummies</option>
              <option>Retro surprise</option>
            </select>
          </label>
          <button type="submit">Request my box</button>
          <p className="formStatus" role="status" aria-live="polite">{orderStatus}</p>
        </form>
      </section>

      <footer>
        <span>Presented with {data.partners.join(', ')}</span>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
