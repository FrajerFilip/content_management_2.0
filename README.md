# Frame – generátor animací

Textové zadání → backend (Express) → Anthropic API → HTML/CSS/JS animace vyrenderovaná v izolovaném `<iframe>`.

## Spuštění

```bash
npm install
cp .env.example .env   # doplň ANTHROPIC_API_KEY
npm start              # http://localhost:3000
```

## Struktura

- `server.js` – Express server, `POST /api/generate-animation`, systémový prompt, volání API
- `public/index.html` – rozhraní (Tailwind přes CDN, mřížka 4 px)
- `public/app.js` – volání API, sandbox iframe, ovládání
- `public/styles.css` – ikony, klávesy, stavy

## API

`POST /api/generate-animation` s tělem `{ "prompt": "..." }` (max. 2000 znaků)
vrací `{ "html": "...", "model": "...", "truncated": false }`.

## Bezpečnost

- API klíč je jen na serveru (`.env`), prohlížeč ho nikdy nedostane.
- Vygenerovaný kód běží v `iframe` se `sandbox="allow-scripts"` (bez `allow-same-origin`),
  takže má vlastní origin a nemá přístup k rodičovské stránce, cookies ani úložišti.
- Do dokumentu se vkládá CSP `default-src 'none'`, která blokuje síťové požadavky.

## Model

Výchozí model je `claude-sonnet-5-5`, změníš ho proměnnou `ANTHROPIC_MODEL`.
Požadavek má zapnutý server-side fallback při odmítnutí (`fallbacks: "default"`).
