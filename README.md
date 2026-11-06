# Frame – generátor animací

Textové zadání → backend (Express) → lokální model v Ollama (nebo Anthropic API) → HTML/CSS/JS animace vyrenderovaná v izolovaném `<iframe>`.

## Spuštění

```bash
npm install
ollama pull qwen2.5-coder:14b
cp .env.example .env
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

- U Anthropic je API klíč jen na serveru (`.env`), prohlížeč ho nikdy nedostane.
- Vygenerovaný kód běží v `iframe` se `sandbox="allow-scripts"` (bez `allow-same-origin`),
  takže má vlastní origin a nemá přístup k rodičovské stránce, cookies ani úložišti.
- Do dokumentu se vkládá CSP `default-src 'none'`, která blokuje síťové požadavky.

## Model

Přepínač `LLM_PROVIDER` v `.env`:

- `ollama` (výchozí) volá `OLLAMA_URL/api/chat` s modelem `OLLAMA_MODEL`.
  Na generování kódu se hodí modely zaměřené na kód, např. `qwen2.5-coder:14b`.
  Malé modely (do ~8B) často vracejí nefunkční HTML.
- `anthropic` používá `ANTHROPIC_MODEL` (výchozí `claude-sonnet-5-5`) a vyžaduje `ANTHROPIC_API_KEY`.
