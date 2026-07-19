"use client";

import { useEffect, useState } from "react";

const PROJECT_TITLE = "Medium-Voltage Synchronous Motor Training Simulator";

export default function HomePage() {
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())),
    );
  }, []);

  const shareProject = async () => {
    const url = window.location.origin;
    const shareData = {
      title: PROJECT_TITLE,
      text: "Explore an interactive concept for medium-voltage synchronous motor, excitation, protection, DCS, and LOTO training.",
      url,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setShareMessage("Share menu opened");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setShareMessage("Project link copied");
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      setShareMessage(copied ? "Project link copied" : "Copy the address from your browser to share it");
    }
  };

  return (
    <main className="portfolio-shell">
      <header className="portfolio-nav">
        <a className="portfolio-brand" href="#top" aria-label="Naythan Ward training concepts home">
          <span>NW</span>
          <div><strong>Naythan Ward</strong><small>Interactive training concepts</small></div>
        </a>
        <nav aria-label="Project navigation">
          <a href="#overview">Overview</a>
          <a href="#about">About</a>
          <a className="nav-launch" href="/motor-floor-vr">Launch simulator</a>
        </nav>
      </header>

      <section className="portfolio-hero" id="top">
        <div className="portfolio-hero-copy">
          <span className="portfolio-eyebrow"><i /> Interactive training concept · Work in progress</span>
          <h1>Medium-voltage motor training, made explorable.</h1>
          <p>
            A browser-based concept for practicing a representative synchronous motor start sequence,
            excitation controls, protection, remote operation, troubleshooting, and group lockout/tagout.
          </p>
          <div className="portfolio-actions">
            <a className="portfolio-primary" href="/motor-floor-vr">Launch the 3D motor floor <span>→</span></a>
            <a className="portfolio-secondary" href="/simulator-v5.html?v=6">Open legacy 2D logic view</a>
            <button type="button" onClick={shareProject}>Share project</button>
          </div>
          <div className="portfolio-launch-note">
            <span>No sign-in required</span>
            <span>Desktop, mobile, and WebXR</span>
            <span role="status" aria-live="polite">{shareMessage}</span>
          </div>
        </div>

        <div className="portfolio-visual" role="img" aria-label="Illustrative legacy medium-voltage control cabinets with open doors">
          <div className="portfolio-visual-top"><span>CONCEPT 01</span><b>LEGACY CONTROL · MODERN TRAINING</b></div>
          <div className="portfolio-visual-tags" aria-hidden="true">
            <span>DOUBLE-ENDED BUS</span><span>REMOTE RACKING</span><span>FIELD CONTROL</span><span>DCS</span>
          </div>
          <div className="portfolio-visual-status"><i /> SIMULATOR ONLINE</div>
        </div>
      </section>

      <section className="portfolio-overview" id="overview" aria-labelledby="overview-title">
        <div className="portfolio-section-heading">
          <span>WHAT THE DEMO COVERS</span>
          <h2 id="overview-title">One representative system. Multiple ways to train.</h2>
          <p>Every control is connected to the same simulated circuit so an action in one location changes the entire system.</p>
        </div>
        <div className="portfolio-feature-grid">
          <article><span>01</span><h3>Power distribution</h3><p>A complete double-ended bus with 16 feeder breakers, main–tie–main transfer, local controls, and drawout interlocks.</p></article>
          <article><span>02</span><h3>Motor and field sequence</h3><p>A single-speed brushed synchronous motor, M-G excitation, field application, discharge resistance, and valve permissives.</p></article>
          <article><span>03</span><h3>Protection and condition</h3><p>Interactive relay pages, five bearing RTDs, motor and pump vibration, alarms, trips, targets, and reset logic.</p></article>
          <article><span>04</span><h3>Local and remote control</h3><p>DCS, field-cabinet, and starter authority with operating controls available at the equipment.</p></article>
          <article><span>05</span><h3>Troubleshooting</h3><p>Injectable control, excitation, valve, protection, temperature, and vibration conditions with latched consequences.</p></article>
          <article><span>06</span><h3>Racking and energy control</h3><p>Generic portable remote racking, a breaker-specific SOP, usable locks/tags, and a gated group LOTO exercise.</p></article>
        </div>
      </section>

      <section className="portfolio-about" id="about">
        <div>
          <span className="portfolio-eyebrow"><i /> WHY I BUILT IT</span>
          <h2>Turning legacy knowledge into something people can safely explore.</h2>
        </div>
        <div className="portfolio-about-copy">
          <p>
            I wanted to explore how decades of electrical-maintenance experience, old control drawings,
            and modern browser technology could become an interactive training environment—one where a
            learner can operate the system, make a mistake, see the consequence, and work through the logic.
          </p>
          <p className="portfolio-signoff"><strong>Naythan Ward</strong><span>Electrical maintenance leader · Simulator concept and technical direction</span></p>
        </div>
      </section>

      <section className="portfolio-disclaimer">
        <div><strong>Representative by design</strong><p>This public demonstration is not modeled from an as-built facility. Equipment names, identifiers, ratings, settings, timing, and logic are illustrative and are being refined for training use.</p></div>
        <div><strong>Training only</strong><p>It is not an operating procedure, relay-settings source, switching order, or authorization to perform electrical or lockout/tagout work.</p></div>
      </section>

      <footer className="portfolio-footer">
        <div><strong>Naythan Ward</strong><span>Interactive electrical training concept</span></div>
        <a href="/motor-floor-vr">Enter simulator <span>→</span></a>
      </footer>
    </main>
  );
}
