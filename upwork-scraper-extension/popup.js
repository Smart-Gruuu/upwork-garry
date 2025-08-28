// Popup UI: logs and communicates with background service worker
const log = (msg) => {
  const status = document.getElementById('status');
  status.textContent += `\n${msg}`;
  status.scrollTop = status.scrollHeight;
  console.log(msg);
};

async function loadSettings() {
  const { refreshMinutes = 10 } = await chrome.storage.local.get(['refreshMinutes']);
  const input = document.getElementById('refreshMinutes');
  if (input) input.value = refreshMinutes;
}

// Listen for progress logs from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'SCRAPER_LOG') {
    log(message.payload);
  }
  if (message?.type === 'SCRAPER_DONE') {
    const jobs = Array.isArray(message.payload) ? message.payload : [];
    log(`Scraping finished. Collected ${jobs.length} jobs.`);
    console.log('[UpworkScraper] Jobs:', jobs);
    if (jobs.length) {
      const preview = jobs
        .slice(0, 5)
        .map((j, i) => `${i + 1}. ${j.title || '(no title)'} - ${j.url || ''}`)
        .join('\n');
      log(`Preview:\n${preview}${jobs.length > 5 ? `\n...and ${jobs.length - 5} more.` : ''}`);
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