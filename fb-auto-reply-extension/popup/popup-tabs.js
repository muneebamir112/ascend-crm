// popup-tabs.js
// Handles switching between the Comments / Messenger / Activity tabs in the
// popup UI. Deliberately kept separate from popup.js — this only toggles
// which section is visible and never touches chrome.storage or any of the
// existing rule/post/log logic.

document.addEventListener('DOMContentLoaded', () => {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });

      tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.getAttribute('data-panel') === targetTab);
      });
    });
  });
});
