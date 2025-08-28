// Popup UI: logs and communicates with background service worker
const log = (msg) => {
  const status = document.getElementById('status');
  status.textContent += `\n${msg}`;
  status.scrollTop = status.scrollHeight;
  console.log(msg);
};

let keywords = [];

function renderKeywords() {
  const container = document.getElementById('keywordsList');
  if (!container) return;
  container.innerHTML = '';
  keywords.forEach((kw, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `${kw} <button data-index="${idx}" title="Remove">×</button>`;
    container.appendChild(chip);
  });
}

async function saveKeywords() {
  await chrome.storage.local.set({ keywords });
}

function addKeywordsFromInput(value) {
  if (!value) return;
  const parts = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  let added = 0;
  for (const p of parts) {
    if (!keywords.some(k => k.toLowerCase() === p.toLowerCase())) {
      keywords.push(p);
      added++;
    }
  }
  if (added > 0) {
    renderKeywords();
    saveKeywords();
  }
}

async function loadSettings() {
  const { refreshMinutes = 10, keywords: storedKeywords = [] } = await chrome.storage.local.get(['refreshMinutes', 'keywords']);
  const input = document.getElementById('refreshMinutes');
  if (input) input.value = refreshMinutes;
  keywords = Array.isArray(storedKeywords) ? storedKeywords : [];
  renderKeywords();
}

// Listen for progress logs from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'SCRAPER_LOG') {
    log(message.payload);
  }
  if (message?.type === 'SCRAPER_DONE') {
    const jobs = Array.isArray(message.payload) ? message.payload : [];

    const kws = keywords.map(k => k.toLowerCase());
    const matches = (job) => {
      if (!kws.length) return true; // no keywords → don't filter
      const title = (job?.title || '').toLowerCase();
      const snippet = (job?.snippet || '').toLowerCase();
      const skillsText = Array.isArray(job?.skills) ? job.skills.join(' ').toLowerCase() : '';
      const haystack = `${title} ${snippet} ${skillsText}`;
      return kws.some(k => haystack.includes(k));
    };

    const shortlisted = jobs.filter(matches);

    // Persist filtered jobs to local storage (merge with existing, de-duplicate by jobUid or URL)
    try {
      const prevRaw = localStorage.getItem('shortlistedJobs');
      let prev = [];
      try {
        const parsed = JSON.parse(prevRaw || '[]');
        if (Array.isArray(parsed)) prev = parsed;
      } catch (_) {}

      const keyOf = (j) => String(j?.jobUid || j?.url || j?.title || JSON.stringify(j));
      const byKey = new Map();
      for (const j of prev) byKey.set(keyOf(j), j);
      for (const j of shortlisted) byKey.set(keyOf(j), j); // new overwrites old

      const merged = Array.from(byKey.values());
      localStorage.setItem('shortlistedJobs', JSON.stringify(merged));
      localStorage.setItem('shortlistedUpdatedAt', String(Date.now()));
    } catch (e) {
      console.warn('Failed to merge/save shortlistedJobs', e);
      localStorage.setItem('shortlistedJobs', JSON.stringify(shortlisted));
      localStorage.setItem('shortlistedUpdatedAt', String(Date.now()));
    }

    log(`Scraping finished. Collected ${jobs.length} jobs. Shortlisted: ${shortlisted.length}${kws.length ? ` (by ${keywords.join(', ')})` : ''}.`);
    console.log('[UpworkScraper] Jobs (all):', jobs);
    console.log('[UpworkScraper] Jobs (shortlisted):', shortlisted);

    const toPreview = shortlisted.length ? shortlisted : jobs;
    if (toPreview.length) {
      const preview = toPreview
        .slice(0, 5)
        .map((j, i) => `${i + 1}. ${j.title || '(no title)'} - ${j.url || ''}`)
        .join('\n');
      log(`Preview:\n${preview}${toPreview.length > 5 ? `\n...and ${toPreview.length - 5} more.` : ''}`);
    }
  }
});

// Wire buttons
window.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();

  document.getElementById('save').addEventListener('click', async () => {
    const minutes = parseInt(document.getElementById('refreshMinutes').value, 10);
    if (!Number.isFinite(minutes) || minutes < 1) {
      log('Please enter a valid refresh interval (minutes >= 1).');
      return;
    }
    await chrome.runtime.sendMessage({ type: 'BG_UPDATE_SETTINGS', payload: { refreshMinutes: minutes } });
    log(`Saved refresh interval: ${minutes} minute(s).`);
  });

  // Keyword input (Enter to add, comma supported)
  const keywordInput = document.getElementById('keywordInput');
  if (keywordInput) {
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = keywordInput.value.trim();
        addKeywordsFromInput(val);
        keywordInput.value = '';
      }
    });
  }

  // Remove keyword chips
  const list = document.getElementById('keywordsList');
  if (list) {
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-index]');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (Number.isInteger(idx) && idx >= 0 && idx < keywords.length) {
        keywords.splice(idx, 1);
        renderKeywords();
        saveKeywords();
      }
    });
  }

  document.getElementById('start').addEventListener('click', async () => {
    document.getElementById('status').textContent = 'Opening Upwork and starting scrape...';
    try {
      await chrome.runtime.sendMessage({ type: 'BG_START' });
      log('Started. The extension will wait for the page to fully load, then scrape.');
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });
});