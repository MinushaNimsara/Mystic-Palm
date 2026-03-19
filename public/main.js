// GSAP animations
function initAnimations() {
  if (typeof gsap === 'undefined') return;

  gsap.from('[data-animate="hero"]', {
    duration: 0.9,
    y: -30,
    opacity: 0,
    ease: 'power3.out'
  });
  gsap.from('.hero-tagline', { duration: 0.7, opacity: 0, delay: 0.2 });
  gsap.from('[data-animate="nav"]', {
    duration: 0.6,
    y: 15,
    opacity: 0,
    delay: 0.25,
    ease: 'power2.out'
  });
  gsap.from('[data-animate="main"] .card', {
    duration: 0.7,
    y: 25,
    opacity: 0,
    stagger: 0.12,
    delay: 0.35,
    ease: 'power2.out'
  });
}

function animateViewSwitch(viewName) {
  if (typeof gsap === 'undefined') return;
  const target = document.getElementById(`view-${viewName}`);
  if (!target) return;
  gsap.fromTo(
    target.querySelectorAll('.card'),
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' }
  );
}

function animateResultReveal(container) {
  if (!container || typeof gsap === 'undefined') return;
  const blocks = container.querySelectorAll('.reading-block');
  if (!blocks.length) return;
  gsap.fromTo(
    blocks,
    { opacity: 0, y: 15 },
    { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out', delay: 0.1 }
  );
}

document.addEventListener('DOMContentLoaded', initAnimations);

const fileInput = document.getElementById('file-input');
const fileButton = document.getElementById('file-button');
const uploadArea = document.getElementById('upload-area');
const preview = document.getElementById('preview');
const previewImage = document.getElementById('preview-image');
const analyzeButton = document.getElementById('analyze-button');
const statusText = document.getElementById('status-text');
const resultCard = document.getElementById('result-card');
const resultContent = document.getElementById('result-content');
const navButtons = document.querySelectorAll('.nav-btn');
const birthDateInput = document.getElementById('birth-date');
const birthTimeInput = document.getElementById('birth-time');
const birthPlaceInput = document.getElementById('birth-place');
const zodiacSelect = document.getElementById('zodiac-select');
const horoscopeForm = document.getElementById('horoscope-form');
const horoscopeButton = document.getElementById('horoscope-button');
const horoscopeStatus = document.getElementById('horoscope-status');
const horoscopeContent = document.getElementById('horoscope-content');

let selectedFile = null;

function switchView(viewName) {
  document.querySelectorAll('.app-view').forEach((v) => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');
  navButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
  });
  animateViewSwitch(viewName);
}

function setStatus(message, type = '') {
  statusText.textContent = message;
  statusText.classList.remove('error', 'success');
  if (type) {
    statusText.classList.add(type);
  }
}

function handleFiles(files) {
  const file = files && files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    setStatus('Please upload an image file (JPG, PNG, etc.).', 'error');
    return;
  }

  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImage.src = e.target.result;
    previewImage.alt = 'Your palm preview';
    preview.hidden = false;
    analyzeButton.disabled = false;
    setStatus('Palm image ready. Start the AI reading when you feel called.', 'success');
  };
  reader.readAsDataURL(file);
}

fileButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (event) => {
  handleFiles(event.target.files);
});

uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('drag-over');
  handleFiles(event.dataTransfer.files);
});

async function analyzePalm() {
  if (!selectedFile) {
    setStatus('Please select a palm image first.', 'error');
    return;
  }

  try {
    analyzeButton.disabled = true;
    setStatus('Consulting the stars and lines in your palm...', '');
    statusText?.classList.add('loading');

    // Convert file to base64 (without the data URL prefix)
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const commaIndex = result.indexOf(',');
        resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(selectedFile);
    });

    // 1) Detect lines with Roboflow (best-effort)
    let detectionSummary = '';
    try {
      const detRes = await fetch('/api/detect-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      });
      if (detRes.ok) {
        const det = await detRes.json();
        const preds = Array.isArray(det.predictions) ? det.predictions : [];
        // Summarize: class + confidence + box
        detectionSummary = preds
          .slice(0, 20)
          .map((p) => {
            const cls = p.class ?? p.class_name ?? 'unknown';
            const conf = typeof p.confidence === 'number' ? p.confidence.toFixed(3) : '';
            const x = typeof p.x === 'number' ? Math.round(p.x) : '';
            const y = typeof p.y === 'number' ? Math.round(p.y) : '';
            const w = typeof p.width === 'number' ? Math.round(p.width) : '';
            const h = typeof p.height === 'number' ? Math.round(p.height) : '';
            return `- ${cls}${conf ? ` (conf ${conf})` : ''}${x !== '' ? ` box[x=${x},y=${y},w=${w},h=${h}]` : ''}`;
          })
          .join('\n');
      }
    } catch (e) {
      // Ignore detection errors and continue with Gemini-only reading
      console.warn('Line detection failed (continuing):', e);
    }

    // 2) Generate reading with Gemini (using detections as hints if available)
    const response = await fetch('/api/analyze-palm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: selectedFile.type,
        detections: detectionSummary
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Server error:', errorData);
      setStatus('The spirits could not be reached. Please try again in a moment.', 'error');
      return;
    }

    const data = await response.json();
    const text = (data.result || '').trim();

    if (!text) {
      setStatus('The reading came back empty. Try another photo.', 'error');
      return;
    }

    const formatted = text
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block.split('\n');
        const firstLine = lines[0];
        if (/life line|heart line|head line|overall/i.test(firstLine)) {
          const title = firstLine.replace(/^#+\s*/, '');
          const rest = lines.slice(1).join('\n').trim();
          return `<div class="reading-block"><h3>${title}</h3>${rest ? `<p>${rest}</p>` : ''}</div>`;
        }
        return `<div class="reading-block"><p>${block}</p></div>`;
      })
      .join('');

    resultContent.innerHTML = formatted;
    resultCard.hidden = false;
    if (typeof gsap !== 'undefined') {
      gsap.from(resultCard, { duration: 0.5, opacity: 0, y: 20, ease: 'power2.out' });
    }
    animateResultReveal(resultContent);
    setStatus('Reading complete. Trust what resonates with you.', 'success');
  } catch (error) {
    console.error('Client error:', error);
    setStatus('Something went wrong during the reading. Please try again.', 'error');
  } finally {
    statusText?.classList.remove('loading');
    analyzeButton.disabled = !selectedFile;
  }
}

analyzeButton.addEventListener('click', analyzePalm);

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.getAttribute('data-view');
    if (view) {
      if (typeof gsap !== 'undefined') {
        gsap.to(btn, { scale: 0.95, duration: 0.1, yoyo: true, repeat: 1 });
      }
      switchView(view);
    }
  });
});

function setHoroscopeStatus(msg, type = '') {
  if (!horoscopeStatus) return;
  horoscopeStatus.textContent = msg;
  horoscopeStatus.classList.remove('error', 'success');
  if (type) horoscopeStatus.classList.add(type);
}

function formatReadingHtml(raw) {
  return (raw || '')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const first = lines[0];
      if (/^#|planetary|personality|love|career|health|today|guidance/i.test(first)) {
        const title = first.replace(/^#+\s*/, '').trim();
        const rest = lines.slice(1).join('\n').trim();
        return `<div class="reading-block"><h3>${title}</h3>${rest ? `<p>${rest}</p>` : ''}</div>`;
      }
      return `<div class="reading-block"><p>${block}</p></div>`;
    })
    .join('');
}

if (horoscopeForm) {
  horoscopeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const birthDate = birthDateInput?.value?.trim() || '';
    const birthTime = birthTimeInput?.value?.trim() || '';
    const birthPlace = birthPlaceInput?.value?.trim() || '';

    if (!birthDate || !birthTime || !birthPlace) {
      setHoroscopeStatus('Please provide birth date, time, and place.', 'error');
      return;
    }
    if (!zodiacSelect?.value) {
      setHoroscopeStatus('Please select your zodiac sign.', 'error');
      return;
    }

    try {
      horoscopeButton.disabled = true;
      setHoroscopeStatus('Reading today\'s celestial pattern for your sign...');
      horoscopeStatus?.classList.add('loading');

      const res = await fetch('/api/horoscope', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zodiacSign: zodiacSelect.value,
          birthDate,
          birthTime,
          birthPlace
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setHoroscopeStatus(err.error || 'Could not reach the stars. Try again.', 'error');
        return;
      }

      const data = await res.json();
      const text = (data.result || '').trim();
      if (!text) {
        setHoroscopeStatus('No horoscope came back. Please try again.', 'error');
        return;
      }

      horoscopeContent.innerHTML = formatReadingHtml(text);
      horoscopeContent.hidden = false;
      animateResultReveal(horoscopeContent);
      const tz = data?.meta?.timezone;
      setHoroscopeStatus(tz ? `Horoscope ready. Timezone: ${tz}` : 'Horoscope ready.', 'success');
    } catch (err) {
      console.error(err);
      setHoroscopeStatus('Something went wrong. Please try again.', 'error');
    } finally {
      horoscopeStatus?.classList.remove('loading');
      horoscopeButton.disabled = false;
    }
  });
}

