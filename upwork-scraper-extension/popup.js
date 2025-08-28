// Trigger content script on the active tab and stream logs back to popup
const log = (msg) => {
  const status = document.getElementById('status');
  status.textContent += `\n${msg}`;
  status.scrollTop = status.scrollHeight;
  console.log(msg);
};

const sendCommandToActiveTab = async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    log('No active tab found.');
    return;
  }
  // inject the content script if not already
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['scraper.js']
  });
  const res = await chrome.tabs.sendMessage(tab.id, { type: command });
  return res;
};

// Listen for progress logs from content script
chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'SCRAPER_LOG') {
    log(message.payload);
  }
  if (message?.type === 'SCRAPER_DONE') {
    const jobs = Array.isArray(message.payload) ? message.payload : [];
    log(`Scraping finished. Collected ${jobs.length} jobs.`);
    // Log full jobs list to console for inspection
    console.log('[UpworkScraper] Jobs:', jobs);
    // Optional: show a short preview in popup
    if (jobs.length) {
      const preview = jobs
        .slice(0, 5)
        .map((j, i) => `${i + 1}. ${j.title || '(no title)'} - ${j.url || ''}`)
        .join('\n');
      log(`Preview:\n${preview}${jobs.length > 5 ? `\n...and ${jobs.length - 5} more.` : ''}`);
    }
  }
});


document.getElementById('scrape').addEventListener('click', async () => {
  document.getElementById('status').textContent = 'Starting...';
  try {
    const res = await sendCommandToActiveTab('START_SCRAPE');
    if (res?.ok) {
      log('Scraper started. Check console for detailed progress.');
    } else {
      log(res?.error || 'Failed to start scraper. Ensure you are on https://www.upwork.com/nx/search/jobs/.');
    }
  } catch (e) {
    log(`Error: ${e.message}`);
  }
});