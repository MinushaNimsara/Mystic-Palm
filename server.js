const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY_2),
    roboflow: !!process.env.ROBOFLOW_API_KEY
  });
});

app.post('/api/detect-lines', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing image data.' });
    }

    const apiKey = process.env.ROBOFLOW_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Server is not configured with ROBOFLOW_API_KEY.' });
    }

    let cleanBase64 = String(imageBase64).replace(/\s/g, '');
    const dataUrlMatch = cleanBase64.match(/^data:[\w+-]+\/[\w+.]+;base64,(.+)$/);
    if (dataUrlMatch) cleanBase64 = dataUrlMatch[1];

    const project = 'palmistry-dhpnb-jsgnm';
    const version = 1;
    const url = `https://serverless.roboflow.com/${project}/${version}?api_key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: cleanBase64
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Roboflow API error:', errorText);
      return res.status(500).json({ error: 'Line detection failed.', details: errorText });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

app.post('/api/analyze-palm', async (req, res) => {
  try {
    const { imageBase64, mimeType, detections } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Missing image data.' });
    }

    const promptText =
      'You are an expert palm reader. IMPORTANT: If the image does NOT show a clear human palm (e.g. it is a poster, logo, face, or other non-palm image), respond with ONLY this exact text: [PALM_NOT_DETECTED]\n\n' +
      'Otherwise, analyze the palm image and describe the Life Line, Heart Line, and Head Line. ' +
      'Give a mystical but positive palm reading in 3–5 short sections with headings: Life Line, Heart Line, Head Line, and Overall Insight.' +
      (detections
        ? `\n\nExtra context: A computer vision detector produced these palm-line detections:\n${detections}\n`
        : '');

    const apiKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
    if (!apiKeys.length) {
      return res.status(500).json({ error: 'Server is not configured with GEMINI_API_KEY.' });
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const body = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType || 'image/jpeg',
                data: imageBase64
              }
            },
            { text: promptText }
          ]
        }
      ]
    };

    let response;
    let errorText = '';
    for (const apiKey of apiKeys) {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(body)
      });
      errorText = await response.text();
      if (response.ok) break;
      if (response.status === 429 && apiKeys.indexOf(apiKey) < apiKeys.length - 1) {
        continue;
      }
      break;
    }

    if (!response.ok) {
      console.error('Gemini API error:', errorText);
      return res.status(500).json({ error: 'AI analysis failed.', details: errorText });
    }

    const data = JSON.parse(errorText || '{}');
    const aiText =
      data.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ').trim() ||
      'Unable to interpret the palm image.';

    if (aiText.includes('[PALM_NOT_DETECTED]') || /not a palm|cannot perform.*palm|does not show.*palm|not a hand|misunderstanding|promotional|poster|flyer|graphic.*not.*palm/i.test(aiText)) {
      return res.status(400).json({ error: 'Please upload a clear photo of your palm. This image does not appear to be a palm.' });
    }

    return res.json({ result: aiText });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

async function resolveBirthPlaceMeta(placeName) {
  if (!placeName) return null;
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(placeName)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  const hit = data?.results?.[0];
  if (!hit) return null;
  return { name: hit.name, country: hit.country, latitude: hit.latitude, longitude: hit.longitude, timezone: hit.timezone };
}

app.post('/api/horoscope', async (req, res) => {
  try {
    const { zodiacSign, birthDate, birthTime, birthPlace } = req.body;
    if (!zodiacSign) return res.status(400).json({ error: 'Missing zodiac sign.' });
    if (!birthDate || !birthTime || !birthPlace) return res.status(400).json({ error: 'Missing birth details (date, time, place).' });

    const placeMeta = await resolveBirthPlaceMeta(birthPlace).catch(() => null);
    const promptText =
      `Create a deep horoscope analysis using these details:\n` +
      `- Zodiac Sign: ${zodiacSign}\n` +
      `- Date of Birth: ${birthDate}\n` +
      `- Time of Birth: ${birthTime}\n` +
      `- Place of Birth: ${birthPlace}\n` +
      (placeMeta?.timezone ? `- Timezone: ${placeMeta.timezone}\n` : '') +
      '\nOutput format: 1) Planetary Context 2) Personality & Core 3) Love & Relationships 4) Career & Finance 5) Health & Energy 6) Today/This Week Guidance. Be insightful, spiritual, and practical.';

    const apiKeys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean);
    if (!apiKeys.length) return res.status(500).json({ error: 'Server is not configured with GEMINI_API_KEY.' });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
    const reqBody = JSON.stringify({
      contents: [{ parts: [{ text: promptText }] }],
      generationConfig: { maxOutputTokens: 800, temperature: 0.9 }
    });

    let response;
    let errText = '';
    for (const apiKey of apiKeys) {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: reqBody
      });
      errText = await response.text();
      if (response.ok) break;
      if (response.status === 429 && apiKeys.indexOf(apiKey) < apiKeys.length - 1) continue;
      break;
    }

    if (!response.ok) {
      console.error('Gemini horoscope error:', errText);
      return res.status(500).json({ error: 'AI analysis failed.', details: errText });
    }

    const data = JSON.parse(errText || '{}');
    const aiText = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join(' ') || 'Unable to generate horoscope.';

    return res.json({
      result: aiText,
      meta: placeMeta?.timezone ? { timezone: placeMeta.timezone } : {}
    });
  } catch (error) {
    console.error('Horoscope server error:', error);
    return res.status(500).json({ error: 'Unexpected horoscope server error.' });
  }
});

function startServer(port) {
  const maxPort = port + 10;
  const server = app.listen(port, () => {
    console.log(`AI Palmistry app listening on http://localhost:${port}`);
    if (!process.env.GEMINI_API_KEY) console.log('  Warning: Set GEMINI_API_KEY in .env for readings');
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < maxPort) {
      console.log(`Port ${port} in use, trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
      process.exit(1);
    }
  });
}

if (process.env.VERCEL !== '1') {
  startServer(PORT);
}

module.exports = app;
