require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_PROMPT_LENGTH = 2000;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('ANTHROPIC_API_KEY není nastaven. Zkopíruj .env.example do .env a doplň klíč.');
}

const client = new Anthropic(); // klíč se čte z ANTHROPIC_API_KEY, nikdy neopouští server

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
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
      return res.status(422).json({ error: 'Model zadání odmítl zpracovat' });
    }

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const html = extractHtml(text);

    if (!/<html|<canvas|<svg/i.test(html)) {
      return res.status(502).json({ error: 'Model nevrátil použitelný kód' });
    }

    res.json({
      html,
      model: response.model,
      truncated: response.stop_reason === 'max_tokens',
    });
  } catch (err) {
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
  console.log(`Server běží na http://localhost:${PORT} (model ${MODEL})`);
});
