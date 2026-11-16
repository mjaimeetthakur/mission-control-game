(() => {
  const root = document.getElementById("root");
  if (!root || !document.body) return;

  const screen = document.createElement("section");
  screen.className = "launch-screen";
  screen.tabIndex = -1;
  screen.setAttribute("role", "dialog");
  screen.setAttribute("aria-modal", "true");
  screen.setAttribute("aria-label", "Mission Control launch sequence");
  screen.innerHTML = `
    <div class="launch-countdown" aria-live="polite">SYSTEMS CHECK</div>
    <div class="launch-topline">
      <div class="launch-brand"><span class="launch-brand-mark" aria-hidden="true">✳</span><span>MISSION CONTROL<small>THE SOLAR SYSTEM AWAITS</small></span></div>
      <div class="launch-top-actions"><span class="launch-live"><i aria-hidden="true"></i> FLIGHT DECK READY</span><button class="launch-skip" type="button">Skip intro <span aria-hidden="true">→</span></button></div>
    </div>
    <div class="launch-art" aria-hidden="true">
      <object data="./assets/solar-system.svg" type="image/svg+xml" aria-label="Animated solar system"></object>
    </div>
    <div class="launch-scene-caption" aria-hidden="true"><span>01 — 08</span> OUR SOLAR SYSTEM <i></i> ONE STAR. EIGHT WORLDS. YOUR MISSION.</div>
    <div class="launch-copy">
      <div class="launch-overline">A new horizon is calling</div>
      <h1 class="launch-title">Somewhere,<br><span>the universe</span><br>is waiting.</h1>
      <p class="launch-description">From the blue world we call home to the quiet edge of the solar system, every journey begins with a choice. Find your world. Shape your mission. Make it matter.</p>
      <div class="launch-actions">
        <button class="button primary launch-cta" type="button">Begin your mission <span aria-hidden="true">↗</span></button>
      </div>
      <div class="launch-caption"><span aria-hidden="true">“</span><span>Every world holds a different story. You decide where ours begins.</span></div>
    </div>`;
  document.body.insertBefore(screen, document.body.firstChild);
  document.body.classList.add("launch-open");
  root.inert = true;

  const start = screen.querySelector(".launch-cta");
  const skip = screen.querySelector(".launch-skip");
  const counter = screen.querySelector(".launch-countdown");
  const solarSystem = screen.querySelector(".launch-art object");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let solarAnimationFrame;
  const syncSolarMotion = () => {
    const svg = solarSystem.contentDocument?.documentElement;
    if (!svg) {
      console.error("Unable to load the solar system illustration.");
      return;
    }

    if (motionPreference.matches) {
      window.cancelAnimationFrame(solarAnimationFrame);
      solarAnimationFrame = undefined;
      return;
    }

    if (solarAnimationFrame !== undefined) return;

    const planets = Array.from(svg.querySelectorAll(".orbiting-planet"), group => {
      const period = Number(group.dataset.orbitSeconds);
      const radiusX = Number(group.dataset.orbitRadiusX);
      const radiusY = Number(group.dataset.orbitRadiusY);
      const startX = Number(group.dataset.orbitStartX);
      const startY = Number(group.dataset.orbitStartY);
      if (![period, radiusX, radiusY, startX, startY].every(Number.isFinite) || period <= 0 || radiusX <= 0 || radiusY <= 0) {
        throw new Error("Solar system planet is missing valid orbit data.");
      }
      return { group, radiusX, radiusY, startX, startY, period };
    });
    const startedAt = performance.now();
    const animate = now => {
      const elapsed = (now - startedAt) / 1000;
      const inclination = -13 * Math.PI / 180;
      for (const { group, radiusX, radiusY, startX, startY, period } of planets) {
        const angle = (elapsed / period) * Math.PI * 2 - Math.PI / 4;
        const localX = radiusX * Math.cos(angle);
        const localY = radiusY * Math.sin(angle);
        const x = 1035 + localX * Math.cos(inclination) - localY * Math.sin(inclination);
        const y = 390 + localX * Math.sin(inclination) + localY * Math.cos(inclination);
        group.setAttribute("transform", `translate(${x - startX} ${y - startY})`);
      }
      solarAnimationFrame = window.requestAnimationFrame(animate);
    };
    solarAnimationFrame = window.requestAnimationFrame(animate);
  };
  solarSystem.addEventListener("load", syncSolarMotion);
  motionPreference.addEventListener("change", syncSolarMotion);
  let sequenceRunning = false;
  let dismissed = false;
  let timer;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    window.clearTimeout(timer);
    window.cancelAnimationFrame(solarAnimationFrame);
    motionPreference.removeEventListener("change", syncSolarMotion);
    screen.classList.add("leaving");
    screen.setAttribute("aria-hidden", "true");
    root.inert = false;
    document.body.classList.remove("launch-open");
    window.setTimeout(() => screen.remove(), 850);
    root.querySelector(".hero-actions .button.primary")?.focus({ preventScroll: true });
  };

  const countdown = ["T−03", "T−02", "T−01", "LIFTOFF"];
  const begin = () => {
    if (sequenceRunning || dismissed) return;
    sequenceRunning = true;
    screen.classList.add("counting");
    start.disabled = true;
    let step = 0;
    const advance = () => {
      if (dismissed) return;
      counter.textContent = countdown[step];
      step += 1;
      if (step === countdown.length) {
        timer = window.setTimeout(dismiss, 620);
      } else {
        timer = window.setTimeout(advance, 670);
      }
    };
    advance();
  };

  start.addEventListener("click", begin);
  skip.addEventListener("click", dismiss);
  screen.addEventListener("keydown", event => {
    if (event.key === "Escape") dismiss();
  });
  screen.focus({ preventScroll: true });
})();
