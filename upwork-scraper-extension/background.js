// Background service worker: manages opening the target URL, waiting for full load,
// injecting scraper, and scheduling periodic refreshes.

const TARGET_URL = 'https://www.upwork.com/nx/search/jobs/';
const ALARM_NAME = 'upwork_scraper_refresh';

// Map notification IDs to URLs for click handling
const notificationUrlMap = new Map();

function createJobNotification(job) {
  const title = job?.title || 'New job';
  const url = job?.url || '';
  const metaParts = [job?.payment, job?.experienceLevel, job?.posted].filter(Boolean);
  const message = metaParts.join(' • ') || 'New shortlisted job';
  const nid = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  notificationUrlMap.set(nid, url);
  chrome.notifications.create(nid, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${title}`,
    message: message,
    priority: 1
  });
}

chrome.notifications.onClicked.addListener((nid) => {
  const url = notificationUrlMap.get(nid);
  if (url) {
    chrome.tabs.create({ url });
    notificationUrlMap.delete(nid);
  }
  chrome.notifications.clear(nid);
});

// Persist settings
const getSettings = async () => {
  const { refreshMinutes = 10, autoOpen = true, scrapePaused = false } = await chrome.storage.local.get(['refreshMinutes', 'autoOpen', 'scrapePaused']);
  return { refreshMinutes, autoOpen, scrapePaused };
};
const setSettings = async (settings) => chrome.storage.local.set(settings);

// Open or focus target tab
async function openOrFocusTarget() {
  const tabs = await chrome.tabs.query({ url: TARGET_URL + '*' });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    return tab;
  }
  const tab = await chrome.tabs.create({ url: TARGET_URL, active: true });
  return tab;
}

// Wait until the tab is fully loaded (complete)
function waitForComplete(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab) return reject(new Error('Tab closed'));
        if (tab.status === 'complete') return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error('Timeout waiting for load'));
        setTimeout(check, 500);
      } catch (e) {
        // If tab was closed during waiting
        if (e && typeof e.message === 'string' && e.message.toLowerCase().includes('no tab')) {
          return reject(new Error('Tab closed'));
        }
        reject(e);
      }
    };
    check();
  });
}

// Inject scraper and start scraping
async function injectAndScrape(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['scraper.js'] });
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'START_SCRAPE' });
  } catch (_) {
    // If content script is not ready yet, retry shortly
    setTimeout(async () => {
      try { await chrome.tabs.sendMessage(tabId, { type: 'START_SCRAPE' }); } catch (_) {}
    }, 1000);
  }
}

// Schedule or clear refresh alarm
async function rescheduleAlarm(minutes) {
  await chrome.alarms.clear(ALARM_NAME);
  if (minutes && minutes > 0) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: minutes, when: Date.now() + minutes * 60000 });
  }
}

// Handle popup commands
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'BG_START') {
      await setSettings({ scrapePaused: false });
      const { refreshMinutes } = await getSettings();
      const tab = await openOrFocusTarget();
      await waitForComplete(tab.id);
      await injectAndScrape(tab.id);
      await rescheduleAlarm(refreshMinutes);
      sendResponse({ ok: true });
    }
    if (msg?.type === 'BG_PAUSE') {
      await setSettings({ scrapePaused: true });
      await chrome.alarms.clear(ALARM_NAME);
      sendResponse({ ok: true });
    }
    if (msg?.type === 'BG_UPDATE_SETTINGS') {
      await setSettings(msg.payload || {});
      const { refreshMinutes, scrapePaused } = await getSettings();
      await rescheduleAlarm(scrapePaused ? 0 : refreshMinutes);
      sendResponse({ ok: true });
    }
    if (msg?.type === 'BG_GET_STATUS') {
      const settings = await getSettings();
      sendResponse({ ok: true, settings });
    }
    if (msg?.type === 'BG_NOTIFY_NEW_JOBS') {
      const list = Array.isArray(msg.payload) ? msg.payload : [];
      for (const job of list) createJobNotification(job);
      sendResponse({ ok: true, count: list.length });
    }
  })();
  return true; // async
});

// Alarm handler: refresh the page and re-scrape when loaded
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const { scrapePaused } = await getSettings();
  if (scrapePaused) return; // do nothing when paused
  const tab = await openOrFocusTarget();
  // Force reload
  await chrome.tabs.reload(tab.id);
  await waitForComplete(tab.id);
  await injectAndScrape(tab.id);
});

// On install, set defaults
chrome.runtime.onInstalled.addListener(async () => {
  const { refreshMinutes } = await getSettings();
  await rescheduleAlarm(refreshMinutes);
});