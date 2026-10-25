/* LowOrbit Black Box - flight recorder for the renderer. Every action, timing and error is logged
   to the session file in the app's blackbox folder, so problems can be diagnosed from data. */
(function () {
  const ring = [];
  const send = line => { try { window.host && window.host.bb(line); } catch (_) {} };
  const BB = window.BB = {
    log(cat, msg, data) {
      const line = `${new Date().toISOString()} [${cat}] ${msg}${data !== undefined ? ' ' + JSON.stringify(data) : ''}`;
      ring.push(line); if (ring.length > 2000) ring.shift();
      send(line);
    },
    error(msg, err) { BB.log('ERROR', msg, { msg: String(err && err.message || err), stack: String(err && err.stack || '').slice(0, 1500) }); },
    recent: () => ring.slice(-50),
  };
  window.addEventListener('error', e => BB.error('WINDOW', e.error || e.message));
  window.addEventListener('unhandledrejection', e => BB.error('PROMISE', e.reason));
  // frame-time watchdog: log if the UI ever stalls
  let last = performance.now();
  const tick = () => { const now = performance.now(); if (now - last > 400) BB.log('PERF', 'UI STALL', { ms: Math.round(now - last) }); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();
