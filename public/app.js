(() => {
  const form = document.getElementById('form');
  const promptEl = document.getElementById('prompt');
  const countEl = document.getElementById('count');
  const submitBtn = document.getElementById('submit');
  const submitLabel = document.getElementById('submit-label');
  const statusEl = document.getElementById('status');
  const stage = document.getElementById('stage');
  const emptyEl = document.getElementById('empty');
  const loadingEl = document.getElementById('loading');
  const elapsedEl = document.getElementById('elapsed');
  const titleEl = document.getElementById('stage-title');
  const timecodeEl = document.getElementById('timecode');
  const reloadBtn = document.getElementById('reload');
  const downloadBtn = document.getElementById('download');
  const fullscreenBtn = document.getElementById('fullscreen');

  // Vložená CSP zakáže síť, formuláře a externí zdroje uvnitř rámce
  const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:";

  let currentHtml = '';
  let frameStart = 0;
  let timecodeRaf = 0;

  function withCsp(html) {
    const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
    if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${meta}`);
    return `<!DOCTYPE html><html><head>${meta}</head><body>${html}</body></html>`;
  }

  // Dynamický iframe: allow-scripts bez allow-same-origin => unikátní origin,
  // žádný přístup k DOM, cookies ani úložišti rodičovské stránky
  function mount(html) {
    stage.querySelector('iframe')?.remove();
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts');
    frame.setAttribute('referrerpolicy', 'no-referrer');
    frame.setAttribute('title', 'Vygenerovaná animace');
    frame.addEventListener('load', () => frame.classList.add('is-ready'), { once: true });
    frame.srcdoc = withCsp(html);
    stage.appendChild(frame);
    emptyEl.classList.add('hidden');
    startTimecode();
  }

  function startTimecode() {
    cancelAnimationFrame(timecodeRaf);
    frameStart = performance.now();
    const tick = (now) => {
      const t = Math.floor((now - frameStart) / 1000 * 30); // 30 snímků/s
      const f = String(t % 30).padStart(2, '0');
      const s = String(Math.floor(t / 30) % 60).padStart(2, '0');
      const m = String(Math.floor(t / 1800)).padStart(2, '0');
      timecodeEl.textContent = `${m}:${s}:${f}`;
      timecodeRaf = requestAnimationFrame(tick);
    };
    timecodeRaf = requestAnimationFrame(tick);
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitLabel.textContent = on ? 'Generuji' : 'Generovat';
    loadingEl.classList.toggle('hidden', !on);
    loadingEl.classList.toggle('flex', on);
    if (on) {
      emptyEl.classList.add('hidden');
      const started = Date.now();
      elapsedEl.textContent = ' 0 s';
      setLoading.timer = setInterval(() => {
        elapsedEl.textContent = ` ${Math.round((Date.now() - started) / 1000)} s`;
      }, 1000);
    } else {
      clearInterval(setLoading.timer);
    }
  }

  function setActions(enabled) {
    [reloadBtn, downloadBtn, fullscreenBtn].forEach((b) => { b.disabled = !enabled; });
  }

  async function generate() {
    const prompt = promptEl.value.trim();
    if (!prompt) { promptEl.focus(); return; }

    setLoading(true);
    statusEl.textContent = '';
    const started = performance.now();

    try {
      const res = await fetch('/api/generate-animation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server vrátil ${res.status}`);

      currentHtml = data.html;
      mount(currentHtml);
      setActions(true);
      titleEl.textContent = prompt;
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      statusEl.textContent = data.truncated
        ? `Hotovo za ${secs} s, výstup byl zkrácen a nemusí fungovat celý`
        : `Hotovo za ${secs} s`;
    } catch (err) {
      statusEl.textContent = err.message || 'Generování selhalo';
      if (!currentHtml) emptyEl.classList.remove('hidden');
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); generate(); });
  promptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate(); }
  });
  promptEl.addEventListener('input', () => { countEl.textContent = promptEl.value.length; });

  document.getElementById('examples').addEventListener('click', (e) => {
    const btn = e.target.closest('.example');
    if (!btn) return;
    promptEl.value = btn.textContent.trim();
    countEl.textContent = promptEl.value.length;
    promptEl.focus();
  });

  reloadBtn.addEventListener('click', () => currentHtml && mount(currentHtml));

  downloadBtn.addEventListener('click', () => {
    if (!currentHtml) return;
    const url = URL.createObjectURL(new Blob([currentHtml], { type: 'text/html' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'animace.html' });
    a.click();
    URL.revokeObjectURL(url);
  });

  fullscreenBtn.addEventListener('click', () => stage.requestFullscreen?.());
})();
