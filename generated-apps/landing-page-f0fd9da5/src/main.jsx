import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="page">
      <nav className="nav"><strong>landing-page</strong><a>Features</a><a>Pricing</a><button>Start Building</button></nav>
      <section className="hero">
        <p className="eyebrow">NexusBrowser generated starter</p>
        <h1>build a landing page</h1>
        <p>OpenCode is now connected to this workspace. It should turn this starter into a polished application using the prompt in OPENCODE_BUILD_PROMPT.md.</p>
        <div className="actions"><button>Get Started</button><button className="ghost">View Plan</button></div>
      </section>
      <section className="grid"><article>Research</article><article>Plan</article><article>Build</article></section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
