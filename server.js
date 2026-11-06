require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = Number(process.env.PORT) || 3000;
const PROVIDER = (process.env.LLM_PROVIDER || 'ollama').toLowerCase();
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:14b';
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 300000;
const MODEL = PROVIDER === 'anthropic' ? ANTHROPIC_MODEL : OLLAMA_MODEL;
const MAX_PROMPT_LENGTH = 2000;

if (!['ollama', 'anthropic'].includes(PROVIDER)) {
  throw new Error(`Neznámý LLM_PROVIDER "${PROVIDER}", použij "ollama" nebo "anthropic"`);
}
if (PROVIDER === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY není nastaven. Zkopíruj .env.example do .env a doplň klíč.');
}

// klíč se čte z ANTHROPIC_API_KEY, nikdy neopouští server
const client = PROVIDER === 'anthropic' ? new Anthropic() : null;

class ProviderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function generateWithOllama(prompt) {
  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        options: { num_predict: 8192, num_ctx: 8192, temperature: 0.4 },
      }),
    });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new ProviderError(504, 'Lokální model neodpověděl včas');
    throw new ProviderError(502, `Ollama na ${OLLAMA_URL} neodpovídá, běží "ollama serve"?`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) {
      throw new ProviderError(502, `Model ${OLLAMA_MODEL} není stažený, spusť "ollama pull ${OLLAMA_MODEL}"`);
    }
    throw new ProviderError(502, data.error || `Ollama vrátila ${res.status}`);
  }
  return {
    text: data.message?.content || '',
    model: data.model || OLLAMA_MODEL,
    truncated: data.done_reason === 'length',
  };
}

async function generateWithAnthropic(prompt) {
  const response = await client.beta.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason === 'refusal') {
    throw new ProviderError(422, 'Model zadání odmítl zpracovat');
  }
  return {
    text: response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''),
    model: response.model,
    truncated: response.stop_reason === 'max_tokens',
  };
}

const SYSTEM_PROMPT = `You generate self-contained browser animations.

Output rules:
- Return ONLY one complete HTML document, starting with <!DOCTYPE html> and ending with </html>.
- No markdown, no code fences, no explanations before or after the document.
- All CSS and JavaScript inline. No external scripts, fonts, images or network requests.
- Use <canvas> with requestAnimationFrame, or inline SVG with CSS/JS animation.
- The animation fills the whole viewport (html, body { margin: 0; height: 100%; overflow: hidden; }) and adapts to window resize.
- It loops smoothly and runs at 60 fps on an average laptop. Avoid heavy per-frame allocations.
- Do not use alert, prompt, confirm, localStorage, cookies, forms or navigation.`;

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}` }));
app.use(express.json({ limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Odstraní případné markdownové ohraničení, pokud ho model přesto vrátí
function extractHtml(text) {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.search(/<!DOCTYPE html|<html/i);
  return start > 0 ? body.slice(start) : body;
}

app.post('/api/generate-animation', async (req, res) => {
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'Chybí zadání' });
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return res.status(400).json({ error: `Zadání je delší než ${MAX_PROMPT_LENGTH} znaků` });
  }

  try {
    const result = PROVIDER === 'anthropic'
      ? await generateWithAnthropic(prompt)
      : await generateWithOllama(prompt);
    const html = extractHtml(result.text);

    if (!/<html|<canvas|<svg/i.test(html)) {
      return res.status(502).json({ error: 'Model nevrátil použitelný kód' });
    }

    res.json({ html, model: result.model, truncated: result.truncated });
  } catch (err) {
    if (err instanceof ProviderError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: 'Neplatný API klíč na serveru' });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: 'Překročen limit požadavků, zkus to za chvíli' });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      return res.status(502).json({ error: 'Chyba při komunikaci s modelem' });
    }
    console.error(err);
    res.status(500).json({ error: 'Interní chyba serveru' });
  }
});

app.listen(PORT, () => {
  console.log(`Server běží na http://localhost:${PORT} (${PROVIDER}, model ${MODEL})`);
});
