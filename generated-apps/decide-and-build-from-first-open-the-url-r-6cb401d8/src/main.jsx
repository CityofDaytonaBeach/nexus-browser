import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import data from './app-data.js';
import './styles.css';

function App() {
  const [activeId, setActiveId] = useState(data.pages[0].id);
  const active = data.pages.find((page) => page.id === activeId) || data.pages[0];
  return <main className="app-shell" style={{ '--accent': data.theme.accent, '--ink': data.theme.ink, '--paper': data.theme.paper }}>
    <nav className="nav"><strong>{data.name}</strong>{data.pages.map((page) => <button key={page.id} className={page.id === active.id ? 'active' : ''} onClick={() => setActiveId(page.id)}>{page.label}</button>)}</nav>
    <section className="hero"><div><p className="eyebrow">{data.category} builder</p><h1>{active.headline}</h1><p>{active.summary}</p><div className="actions"><button>{data.primaryCta}</button><button className="ghost">View system</button></div></div><aside className="artifact"><span>{data.signature}</span><b>{data.metric}</b><small>{data.metricLabel}</small></aside></section>
    <section className="feature-grid">{active.features.map((feature, index) => <article key={feature}><span>{String(index + 1).padStart(2, '0')}</span><h2>{feature}</h2><p>{data.featureDetails[index % data.featureDetails.length]}</p></article>)}</section>
    <section className="workflow"><h2>Live product workflow</h2>{data.workflow.map((step) => <div key={step}><span></span>{step}</div>)}</section>
    <section className="updates"><h2>Conversation updates</h2>{data.updates.length ? data.updates.map((update) => <p key={update}>{update}</p>) : <p>Ask Nexus to change layout, content, integrations, mobile states, game feel, or UI direction and this app will update from chat.</p>}</section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
