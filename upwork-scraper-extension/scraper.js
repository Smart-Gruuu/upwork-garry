/*
Content script that:
- Validates URL is Upwork job search
- Iterates visible job cards, extracting structured data
- Logs progress to console and to extension popup via runtime messages
- Optionally scrolls to load more results (configurable)
- Sends browser notification when done and prints the list to console
*/

(function () {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const log = (msg) => {
    console.log(`[UpworkScraper] ${msg}`);
    try { chrome.runtime.sendMessage({ type: 'SCRAPER_LOG', payload: msg }); } catch (_) { }
  };

  const isValidPage = () => {
    return /https:\/\/www\.upwork\.com\/nx\/search\/jobs\/?.*/.test(location.href);
  };

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      const perm = await Notification.requestPermission();
      return perm;
    } catch {
      return Notification.permission;
    }
  };

  // Extract data from a job card element
  const parseJobCard = (el) => {
    const getText = (sel) => el.querySelector(sel)?.textContent?.trim() || '';
    const getAttr = (sel, attr) => el.querySelector(sel)?.getAttribute(attr) || '';

    // Key attributes
    const jobUid = el.getAttribute('data-ev-job-uid') || el.getAttribute('data-job-uid') || '';

    // Title and URL
    const titleEl = el.querySelector('[data-test="job-tile-title-link"], a[href*="/jobs/"]');
    const title = titleEl?.textContent?.trim() || '';
    const url = titleEl?.href || '';

    // Description snippet
    const snippet = getText('[data-test="UpCLineClamp JobDescription"]');

    // Job metadata
    const payment = getText('[data-test="job-type-label"]'); // Fixed price / Hourly
    const budget = getText('[data-test="is-fixed-price"]');
    const hourly = getText('[data-test="job-type-label"]'); // Hourly range text
    const posted = getText('[data-test="job-pubilshed-date"]');
    const numProposals = getText('[data-test="proposals-tier"]');
    const experienceLevel = getText('[data-test="experience-level"], [data-test="contractor-tier"]');
    const duration = getText('[data-test="duration-label"]');
    const workload = getText('[data-test="workload"]');
    const locationRequirement = getText('[data-test="location"], [data-test*="location"]');

    // Skills: select token buttons inside the container (exclude "+N" overflow div)
    let skills = Array.from(el.querySelectorAll('[data-test="TokenClamp JobAttrs"] [data-test="token"]'))
      .map(btn => btn.textContent.trim())
      .filter(Boolean);
    // Fallback to legacy chips if needed
    if (skills.length === 0) {
      skills = Array.from(el.querySelectorAll('[data-test="token-Chip"]'))
        .map(x => x.textContent.trim())
        .filter(Boolean);
    }
    // De-duplicate
    skills = Array.from(new Set(skills));

    // Client info
    const clientCountry = getText('[data-test="location"]');
    const clientPaymentStatus = getText('[data-test="total-spent"]');
    const clientPaymentVerified = getText('[data-test="payment-verified"]');
    const clientSpend = getText('[data-test="total-spend"]');
    const clientJobsPosted = getText('[data-test="client-jobs-posted"]');
    const clientHireRate = getText('[data-test="client-hire-rate"]');

    // Rating (try aria-label on stars, fallback to text)
    const ratingLabel = el.querySelector('[data-test="total-feedback"] [aria-label]')?.getAttribute('aria-label')
      || el.querySelector('[data-test="total-feedback"]')?.textContent?.trim() || '';
    const clientRating = ratingLabel;

    return {
      jobUid,
      title,
      url,
      snippet,
      payment,
      budget,
      hourly,
      posted,
      experienceLevel,
      duration,
      workload,
      locationRequirement,
      numProposals,
      skills,
      clientCountry,
      clientPaymentVerified,
      clientPaymentStatus,
      clientSpend,
      clientJobsPosted,
      clientHireRate,
      clientRating
    };
  };

  const findJobCards = () => {
    // Prefer explicit Upwork job card selector
    const cards = Array.from(document.querySelectorAll('article[data-ev-job-uid], article[data-job-uid]'));
    if (cards.length) return cards;

    // Fallbacks if structure changes
    const container = document.querySelector('[data-test="job-tile-list"]') || document;
    const altCards = Array.from(container.querySelectorAll('[data-test="UpCJobTile"], [data-test="job-tile-list"] article, article[data-test], li[data-test*="job"]'));
    if (altCards.length) return altCards;

    // Last resort: any element around job links
    return Array.from(document.querySelectorAll('a[href*="/jobs/"]'))
      .map(a => a.closest('article, li, div'))
      .filter(Boolean);
  };

  // const scrollToLoad = async (targetCount, maxScrolls = 30) => {
  //   let lastCount = 0;
  //   for (let i = 0; i < maxScrolls; i++) {
  //     window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  //     await sleep(1200);
  //     const cards = findJobCards();
  //     log(`Loaded ${cards.length} job cards...`);
  //     if (cards.length >= targetCount) return cards.length;
  //     if (cards.length === lastCount) {
  //       // Try nudging with small scroll up/down
  //       window.scrollBy(0, -200);
  //       await sleep(300);
  //     }
  //     lastCount = cards.length;
  //   }
  //   return findJobCards().length;
  // };

  const runScrape = async () => {
    if (!isValidPage()) {
      const msg = 'Please open https://www.upwork.com/nx/search/jobs/ and run again.';
      log(msg);
      return { ok: false, error: msg };
    }

    log('Starting scrape...');

    // Optional: control how many jobs to load (0 = all available via scrolling heuristic)
    // const TARGET_MIN = 0;

    // Ensure content is loaded by scrolling
    // const initialCards = findJobCards();
    // log(`Initial job cards: ${initialCards.length}`);

    // if (TARGET_MIN > 0 && initialCards.length < TARGET_MIN) {
    //   await scrollToLoad(TARGET_MIN);
    // } else if (TARGET_MIN === 0) {
    //   // attempt to load more by a few scrolls
    //   await scrollToLoad(initialCards.length + 40, 20);
    // }

    const cards = findJobCards();
    log(`Parsing ${cards.length} job cards...`);

    const jobs = [];
    for (let i = 0; i < cards.length; i++) {
      try {
        const job = parseJobCard(cards[i]);
        if (job?.title) {
          jobs.push(job);
          // Log full job details for each card
          console.log('[UpworkScraper] Job parsed:', job);
        }
        log(`Progress: ${i + 1}/${cards.length}`);
      } catch (e) {
        console.warn('Parse error', e);
      }
      // Small yield to keep UI responsive
      if (i % 15 === 0) await sleep(0);
    }

    // Log final results to console
    console.log('[UpworkScraper] Result jobs:', jobs);

    // Notify via popup channel
    try { chrome.runtime.sendMessage({ type: 'SCRAPER_DONE', payload: jobs }); } catch (_) { }

    // Browser-level notification (Windows toast via chromium integration)
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      const n = new Notification('Upwork Scraper', {
        body: `Scraping complete. Collected ${jobs.length} jobs.`,
        icon: 'https://www.upwork.com/static/favicon.ico'
      });
      setTimeout(() => n.close(), 6000);
    } else {
      log(`Notification permission: ${permission}.`);
    }

    return { ok: true, jobs };
  };

  // Listen for popup commands
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'START_SCRAPE') {
      runScrape().then(res => sendResponse(res));
      return true; // async
    }
  });
})();