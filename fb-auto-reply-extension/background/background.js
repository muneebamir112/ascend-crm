// background.js

// Make the toolbar icon open the side panel (instead of a dropdown popup)
// so the UI stays open across tab/window switches instead of auto-closing.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[FB Auto-Reply] Failed to set side panel behavior:', error));

chrome.runtime.onInstalled.addListener(() => {
  console.log("FB Auto-Reply Extension Installed.");
  // Initialize default settings if not present
  chrome.storage.local.get(['isActive', 'rateLimit'], (data) => {
    const defaults = {};
    if (data.isActive === undefined) defaults.isActive = false;
    if (data.rateLimit === undefined) defaults.rateLimit = 10;

    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// --- DM contact logging to Google Sheets ------------------------------------
// When someone triggers a Messenger DM keyword rule, messenger.js sends this
// script a { type: 'LOG_DM_CONTACT', name, profileUrl } message. Content
// scripts can't use chrome.identity, so the OAuth token request and the
// actual Sheets API call both have to happen here in the background script.

const DM_CONTACTS_SPREADSHEET_ID = '1DgpRxQq83GE6lKQ5O-Lya-hVbyqRFU3w8MEyjmJCELc';
// Adjust this if the target sheet's tab isn't actually named "Sheet1".
const DM_CONTACTS_SHEET_RANGE = 'Sheet1!A:D';

function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('No auth token received'));
        return;
      }
      resolve(token);
    });
  });
}

async function logDmContactToSheet(name, profileUrl, leadEvent) {
  const token = await getAuthToken(true);

  const timestamp = new Date().toLocaleString();
  const safeName = name || 'Unknown';
  const safeUrl = profileUrl || '';
  const safeEvent = leadEvent || 'Pending';

  // 1. Fetch current rows
  const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${DM_CONTACTS_SPREADSHEET_ID}/values/${encodeURIComponent(DM_CONTACTS_SHEET_RANGE)}`;
  const getRes = await fetch(getUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Sheets API GET error ${getRes.status}: ${errText}`);
  }

  const data = await getRes.json();
  const rows = data.values || [];

  // 2. Find if this person already exists (skip header)
  let existingRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r[0] === safeName || (safeUrl && r[1] === safeUrl)) {
      existingRowIndex = i;
      break;
    }
  }

  const rowData = [safeName, safeUrl, timestamp, safeEvent];

  if (existingRowIndex >= 0) {
    // 3a. Update existing row
    const sheetRowNumber = existingRowIndex + 1;
    const updateRange = `Sheet1!A${sheetRowNumber}:D${sheetRowNumber}`;
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${DM_CONTACTS_SPREADSHEET_ID}/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`;
    
    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowData] })
    });
    
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Sheets API PUT error ${updateRes.status}: ${errText}`);
    }
  } else {
    // 3b. Append new row
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${DM_CONTACTS_SPREADSHEET_ID}/values/${encodeURIComponent(DM_CONTACTS_SHEET_RANGE)}:append?valueInputOption=USER_ENTERED`;
    const appendRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [rowData] })
    });
    
    if (!appendRes.ok) {
      const errText = await appendRes.text();
      throw new Error(`Sheets API POST error ${appendRes.status}: ${errText}`);
    }
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'LOG_DM_CONTACT') {
    logDmContactToSheet(message.name, message.profileUrl, message.leadEvent)
      .then(() => sendResponse({ success: true }))
      .catch((err) => {
        console.error('[FB Auto-Reply] Failed to log DM contact to Google Sheet:', err);
        sendResponse({ success: false, error: String(err && err.message || err) });
      });
    return true; // keep the message channel open for the async sendResponse
  }
});
