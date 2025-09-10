---
description: Repository Information Overview
alwaysApply: true
---

# Upwork Job Scraper Extension Information

## Summary
A Chrome browser extension that scrapes job details from Upwork job search pages. It automatically collects job information, filters by keywords, saves matching jobs, and provides notifications for new opportunities. The extension supports periodic auto-refresh to continuously monitor for new jobs.

## Structure
- **background.js**: Service worker that manages tab opening, refresh scheduling, and notifications
- **scraper.js**: Content script that extracts job data from Upwork search pages
- **popup.html/js**: User interface for controlling the extension and viewing saved jobs
- **manifest.json**: Extension configuration and permissions
- **icons/**: Extension icon assets in various sizes

## Language & Runtime
**Language**: JavaScript
**Version**: ES6+
**Browser API**: Chrome Extension Manifest V3
**Package Manager**: None (standalone browser extension)

## Dependencies
The extension is self-contained with no external dependencies. It relies on:

**Chrome Extension APIs**:
- chrome.runtime (messaging)
- chrome.scripting (content script injection)
- chrome.tabs (tab management)
- chrome.alarms (scheduling refreshes)
- chrome.storage (settings persistence)
- chrome.notifications (job alerts)

## Build & Installation
The extension can be loaded directly in Chrome's developer mode:

```bash
# In Chrome, navigate to chrome://extensions/
# Enable "Developer mode"
# Click "Load unpacked" and select the extension directory
```

## Main Components

### Background Service Worker
**File**: `background.js`
**Purpose**: Manages the extension's background operations
**Features**:
- Opens and refreshes the Upwork job search page
- Injects the scraper script into the page
- Schedules periodic refreshes using chrome.alarms
- Handles browser notifications for new jobs
- Manages extension settings persistence

### Content Script
**File**: `scraper.js`
**Purpose**: Extracts job data from Upwork pages
**Features**:
- Identifies and parses job listing cards
- Extracts detailed job information (title, skills, payment, etc.)
- Reports progress to the popup interface
- Sends collected job data back to the extension

### User Interface
**Files**: `popup.html`, `popup.js`
**Purpose**: Control panel and job management
**Features**:
- Start/pause scraping
- Configure refresh interval
- Add/remove keyword filters
- View and manage saved jobs
- Copy job links to clipboard
- Display scraping progress and logs

### Extension Configuration
**File**: `manifest.json`
**Version**: 1.1.0
**Permissions**:
- activeTab, scripting (for content script injection)
- notifications (for job alerts)
- tabs (for opening/managing Upwork tabs)
- alarms (for scheduling refreshes)
- storage (for saving settings)
**Host Permissions**: https://www.upwork.com/*