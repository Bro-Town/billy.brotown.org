(function () {
  /* 
     toggle verbose logging with localStorage.cursorDebug = "1" then reload
     to remove, it's localStorage.removeItem("cursorDebug")
     
     yes, YOU (the user!) can debug this too (for whatever reason)
     website is open source
     mainly because i wanted to steal lamp's code from when he did this
     but wouldn't give me the code he used so fuck that guy i did this myself
     with a little point help from claude because i do not know what i'm doing
     in terms of mapping and canvas

     https://github.com/Bro-Town/billy.brotown.org
  */ 
  let DEBUG = false;
  try {
    DEBUG = localStorage.getItem("cursorDebug") === "1";
  } catch (e) {
    /* localStorage unavailable, stay quiet */
  }
  function log(...args) {
    if (DEBUG) console.log("[cursor-trails]", ...args);
  }

  const canvas = document.getElementById("cursor-bg");
  if (!canvas || !canvas.getContext) {
    log("no canvas found, aborting");
    return;
  }
  log("init ok");
  const ctx = canvas.getContext("2d");

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  /*
   yeah if you want to block this with uBO i do not blame you
   but i do not want to make it opt-in because i think it's cool
   here's the filter:
   billy.brotown.org##+js(aeld, /^(?:mousemove|touchmove|pagehide|beforeunload)$/)

   i've also just realised writing this that this could entirely
   be exploited to send whatever data you want
  
   whatever, get creative
   and then show me on mastodon
   https://billys.mom/@billy
  */
  const MAX_POINTS = 400;
  const SAMPLE_MS = 50;
  let points = [];
  let lastSample = 0;
  const startTime = performance.now();
  let sent = false;

  function recordPoint(x, y) {
    const now = performance.now();
    if (now - lastSample < SAMPLE_MS) return;
    lastSample = now;
    points.push([
      Math.min(1, Math.max(0, x / window.innerWidth)),
      Math.min(1, Math.max(0, y / window.innerHeight)),
      Math.round(now - startTime),
    ]);
    if (points.length > MAX_POINTS) points.shift();
    log("recorded point, total:", points.length);
  }

  window.addEventListener("mousemove", (e) => recordPoint(e.clientX, e.clientY));
  window.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches[0]) recordPoint(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );

  function sendTrail() {
    log("sendTrail called, points:", points.length, "sent:", sent);
    if (sent || points.length < 2) return;
    sent = true;
    const blob = new Blob([JSON.stringify({ points })], { type: "application/json" });
    const queued = navigator.sendBeacon("/api/cursors", blob);
    log("sendBeacon queued:", queued);
  }

  window.addEventListener("pagehide", sendTrail);
  window.addEventListener("beforeunload", sendTrail);

  // ---------- playback of past visitors ----------
  let trails = [];

  fetch("/api/cursors", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : []))
    .then((data) => {
      trails = (data || [])
        .filter((t) => t.points && t.points.length > 1)
        .map((t) => ({ ...t, progress: Math.random() }));
      log("loaded trails:", trails.length);
    })
    .catch((e) => log("failed to load trails:", e));

  function pointAt(trail) {
    const pts = trail.points;
    const dur = pts[pts.length - 1][2] || 1;
    const t = trail.progress * dur;
    let i = 0;
    while (i < pts.length - 2 && pts[i + 1][2] < t) i++;
    const a = pts[i];
    const b = pts[i + 1] || a;
    const span = Math.max(1, b[2] - a[2]);
    const f = Math.min(1, Math.max(0, (t - a[2]) / span));
    return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f };
  }

  let lastFrame = performance.now();

  function draw() {
    const now = performance.now();
    const dt = now - lastFrame;
    lastFrame = now;

    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);

    for (const trail of trails) {
      const pts = trail.points;
      const hue = trail.hue || 200;

      // static, non-fading trail line
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
      }
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `hsla(${hue}, 80%, 65%, 0.25)`;
      ctx.stroke();

      // dot animating along the path, looping
      const dur = pts[pts.length - 1][2] || 1;
      trail.progress += dt / Math.max(dur, 1500);
      if (trail.progress > 1) trail.progress -= 1;
      const p = pointAt(trail);

      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${hue}, 90%, 70%, 0.5)`;
      ctx.fill();
    }

    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();