// messenger.js
// Watches the currently-open Messenger conversation for incoming messages
// containing a keyword, and auto-replies in that same conversation.
// Independent from content.js (comment auto-reply) — separate storage key
// (dmRules) and its own keyword list, per design.

(function () {
  // Guard against this script being injected twice into the same frame
  // (can happen with iframes / Facebook restoring a cached page) — a second
  // run would otherwise throw on redeclaration, or worse, run two independent
  // watchers that both try to reply to the same message.
  if (window.__fbAutoReplyMessengerLoaded) {
    console.log("[FB Auto-Reply DM] Content script already loaded in this frame, skipping re-init.");
    return;
  }
  window.__fbAutoReplyMessengerLoaded = true;

  console.log("FB Auto-Reply (Messenger DM) MVP: Content script loaded.");

  // Exact SVG path data for Messenger's send (paper-plane) icon, confirmed
  // from the real DOM — used to precisely locate the send button.
  const SEND_ICON_PATH_D = 'M16.6915026,12.4744748 L3.50612381,13.2599618 C3.19218622,13.2599618 3.03521743,13.4170592 3.03521743,13.5741566 L1.15159189,20.0151496 C0.8376543,20.8006365 0.99,21.89 1.77946707,22.52 C2.41,22.99 3.50612381,23.1 4.13399899,22.8429026 L21.714504,14.0454487 C22.6563168,13.5741566 23.1272231,12.6315722 22.9702544,11.6889879 C22.8132856,11.0605983 22.3423792,10.4322088 21.714504,10.118014 L4.13399899,1.16346272 C3.34915502,0.9 2.40734225,1.00636533 1.77946707,1.4776575 C0.994623095,2.10604706 0.8376543,3.0486314 1.15159189,3.99121575 L3.03521743,10.4322088 C3.03521743,10.5893061 3.34915502,10.7464035 3.50612381,10.7464035 L16.6915026,11.5318905 C16.6915026,11.5318905 17.1624089,11.5318905 17.1624089,12.0031827 C17.1624089,12.4744748 16.6915026,12.4744748 16.6915026,12.4744748 Z';

  let dmState = {
    isActive: false,
    dmRules: []
  };

  const processedMessages = new WeakSet();

  let contextInvalidatedWarned = false;

  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  function handleInvalidatedContext() {
    if (!contextInvalidatedWarned) {
      contextInvalidatedWarned = true;
      console.warn('%c[FB Auto-Reply DM] Disconnected from the extension (it was reloaded/updated). Refresh this page to reconnect.', 'color: orange; font-weight: bold; font-size: 13px;');
    }
    stopWatching();
  }

  function loadState() {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    console.log("[FB Auto-Reply DM] Loading state from storage...");
    chrome.storage.local.get(['isActive', 'dmRules'], (data) => {
      console.log("[FB Auto-Reply DM] Loaded state data:", data);
      dmState.isActive = data.isActive ?? false;
      dmState.dmRules = data.dmRules || [];
      updateWatching();
    });
  }

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.isActive) dmState.isActive = changes.isActive.newValue;
      if (changes.dmRules) dmState.dmRules = changes.dmRules.newValue;
      updateWatching();
    }
  });

  function updateWatching() {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    if (dmState.isActive && dmState.dmRules.length > 0) {
      console.log("[FB Auto-Reply DM] Active with DM rules configured — watching this conversation.");
      startWatching();
      startSidebarWatching();
    } else {
      stopWatching();
      stopSidebarWatching();
    }
  }

  let observer = null;
  let rescanInterval = null;
  const RESCAN_INTERVAL_MS = 15000;

  function startWatching() {
    if (observer) return; // Already watching

    console.log("[FB Auto-Reply DM] Starting MutationObserver to detect new messages...");

    observer = new MutationObserver((mutations) => {
      if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              processNodeForMessages(node);
            }
          });
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial scan in case messages are already on the page
    processNodeForMessages(document.body);

    // Safety-net rescan, same reasoning as the comment watcher: Messenger doesn't
    // always insert new messages live, and backgrounded tabs get throttled.
    rescanInterval = setInterval(() => {
      if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
      processNodeForMessages(document.body);
    }, RESCAN_INTERVAL_MS);
  }

  function stopWatching() {
    if (observer) {
      console.log("[FB Auto-Reply DM] Stopping MutationObserver.");
      observer.disconnect();
      observer = null;
    }
    if (rescanInterval) {
      clearInterval(rescanInterval);
      rescanInterval = null;
    }
  }

  // --- Auto-open unread conversations from the sidebar ---------------------
  // The watcher above only sees messages inside whichever conversation is
  // currently open — a closed conversation's messages aren't in the page's
  // DOM at all for it to detect. This section watches the conversation list
  // for unread previews and clicks into them; the existing watcher then picks
  // up and replies to the newly-visible message exactly as if the user had
  // opened that chat themselves. Best-effort heuristics (bolded unread
  // previews, "/t/" conversation links) since Messenger's real sidebar markup
  // hasn't been inspected directly — first thing to check against the real
  // DOM if this doesn't pick up an unread conversation.
  const SIDEBAR_SCAN_INTERVAL_MS = 4000;
  let sidebarScanInterval = null;
  let openingConversation = false;

  function isConversationLinkUnread(link) {
    if (link.querySelector('[style*="font-weight: 600"], [style*="font-weight: bold"], strong')) return true;
    const ariaLabel = link.getAttribute('aria-label') || '';
    if (/unread/i.test(ariaLabel)) return true;
    if (link.querySelector('[aria-label*="unread" i]')) return true;
    return false;
  }

  function isCurrentConversationLink(link) {
    try {
      if (link.href) {
        return new URL(link.href, window.location.href).pathname === window.location.pathname;
      }
      return false; // If it's a div, we can't easily check URL, so we assume it might not be current.
    } catch (e) {
      return false;
    }
  }

  function scanSidebarForUnreadConversations() {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    if (openingConversation || dmReplyInProgress) return; // don't interrupt an in-progress open/reply

    // Scope to sidebar to avoid clicking message bubbles which also have role="row"
    const sidebar = document.querySelector('div[data-pagelet="MWThreadList"], div[aria-label="Chats" i], div[role="navigation"]');
    if (!sidebar) return;

    const links = sidebar.querySelectorAll('a[href*="/t/"], div[role="row"], div[data-testid="mwthreadlist-item"]');
    for (const link of links) {
      if (isCurrentConversationLink(link)) continue; // already open — existing watcher handles it
      if (!isConversationLinkUnread(link)) continue;

      console.log("[FB Auto-Reply DM] Found an unread conversation, opening it to check for a keyword match...");
      openingConversation = true;
      link.click();
      // Give Messenger a moment to load the conversation before the next scan.
      setTimeout(() => { openingConversation = false; }, 2500);
      break; // handle one at a time per scan cycle
    }
  }

  function startSidebarWatching() {
    if (sidebarScanInterval) return;
    console.log("[FB Auto-Reply DM] Starting sidebar scan for unread conversations...");
    sidebarScanInterval = setInterval(scanSidebarForUnreadConversations, SIDEBAR_SCAN_INTERVAL_MS);
  }

  function stopSidebarWatching() {
    if (sidebarScanInterval) {
      clearInterval(sidebarScanInterval);
      sidebarScanInterval = null;
    }
  }

  const DIR_AUTO_SELECTOR = 'div[dir="auto"], span[dir="auto"]';

  function processNodeForMessages(rootNode) {
    const potentialTextNodes = rootNode.querySelectorAll ? rootNode.querySelectorAll(DIR_AUTO_SELECTOR) : [];
    const elementsToProcess = Array.from(potentialTextNodes);
    if (rootNode.matches && rootNode.matches(DIR_AUTO_SELECTOR)) {
      elementsToProcess.push(rootNode);
    }

    // Same nested-wrapper problem as comments: only keep the innermost match.
    const leafElementsToProcess = elementsToProcess.filter(el => !el.querySelector(DIR_AUTO_SELECTOR));

    leafElementsToProcess.forEach(el => {
      if (processedMessages.has(el)) return;

      const bubble = findMessageBubble(el);
      if (!bubble) return; // Not part of an actual message row (e.g. page chrome/sidebar text)

      processedMessages.add(el);

      if (isOutgoingMessage(bubble)) return; // Never react to our own sent messages

      const text = el.innerText || el.textContent;
      if (!text || text.trim().length === 0) return;

      checkTextAgainstDmRules(text, bubble);
    });
  }

  // Messenger wraps each message in a row-like element. This selector is a
  // best guess based on Messenger's general structure — if messages aren't
  // being detected, this is the first thing to check against the real DOM.
  function findMessageBubble(el) {
    return el.closest('[role="row"]') || el.closest('[role="gridcell"]') || null;
  }

  // Distinguish an incoming message (from the other person) from one we sent
  // ourselves — Messenger commonly labels rows/elements with an aria-label
  // starting "You sent ...". This is a best-effort heuristic and may need
  // adjusting once we see the real DOM.
  function isOutgoingMessage(bubble) {
    const ownLabel = bubble.getAttribute('aria-label') || '';
    if (/^you sent/i.test(ownLabel)) return true;

    const labelledDescendant = bubble.querySelector('[aria-label]');
    if (labelledDescendant && /^you sent/i.test(labelledDescendant.getAttribute('aria-label') || '')) {
      return true;
    }

    return false;
  }

  let dmReplyInProgress = false;

  // A DM rule may have a single legacy `reply` string, or a `messages` array —
  // an ordered sequence sent one after another (not randomized) when the
  // keyword is detected. Same normalization pattern used for comment rules.
  function getDmMessageSteps(rule) {
    if (rule.messages && rule.messages.length) return rule.messages;
    if (rule.reply) return [rule.reply];
    return [];
  }

  // Brief pause between sequential messages so Messenger's composer/UI has
  // time to settle before the next message is typed in.
  const DM_SEQUENCE_STEP_DELAY_MS = 700;

  // Conversations already logged to the Google Sheet in this page session —
  // avoids adding a duplicate row every time the same person triggers a
  // later step in a multi-message DM flow.
  const loggedConversationKeys = new Set();

  // True if href plausibly points at a Facebook profile — used to filter out
  // unrelated links (nav/home links, the conversation thread's own URL, etc.)
  // picked up while scanning for the other person's profile link.
  function looksLikeProfileLink(href) {
    if (!href) return false;
    try {
      const url = new URL(href, window.location.href);
      if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return false;
      const path = url.pathname.replace(/\/+$/, '');
      if (!path) return false; // bare domain root ("https://www.facebook.com/") — not a profile
      if (/^\/(messages|login|help|legal|privacy|policies|settings|groups|marketplace|watch|gaming|ads|pages)(\/|$)/i.test(path)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Climbs up to maxLevels ancestors from startEl looking for a plausible
  // profile link, scoped to that specific area of the page rather than a
  // document-wide search — a document-wide search was picking up unrelated
  // links elsewhere on the page (e.g. our own account's own link).
  function findScopedProfileLink(startEl, maxLevels) {
    let node = startEl;
    let levels = 0;
    while (node && node !== document.body && levels < maxLevels) {
      const links = node.querySelectorAll('a[href]');
      for (const link of links) {
        if (looksLikeProfileLink(link.href)) return link.href;
      }
      node = node.parentElement;
      levels++;
    }
    return null;
  }

  // Best-effort extraction of the other person's name and profile URL from
  // the open conversation, scoped to avoid picking up our own account's info.
  function getConversationProfileInfo(bubble) {
    let name = null;
    let profileUrl = null;

    // Name: the composer's aria-label ("Write to <Name>") is a
    // confirmed-reliable source, and always refers to the OTHER person —
    // deliberately no document-wide fallback for name, since that's exactly
    // what previously grabbed our own account's name instead of theirs.
    const composer = findMessageComposer();
    if (composer) {
      const label = composer.getAttribute('aria-label') || '';
      const match = label.match(/^write to (.+)$/i);
      if (match) name = match[1].trim();
    }

    // Profile URL: prefer scanning near the actual incoming message bubble
    // that triggered this (tightest, most reliable scope), falling back to
    // scanning near the composer if that doesn't find one.
    if (bubble) profileUrl = findScopedProfileLink(bubble, 10);
    if (!profileUrl && composer) profileUrl = findScopedProfileLink(composer.parentElement, 15);

    return { name, profileUrl };
  }

  function logDmContactEvent(bubble, leadEvent) {
    const { name, profileUrl } = getConversationProfileInfo(bubble);
    if (!name) return;
    if (!isExtensionContextValid()) return;
    
    chrome.runtime.sendMessage({ type: 'LOG_DM_CONTACT', name, profileUrl, leadEvent }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[FB Auto-Reply DM] Failed to reach background script for Sheet logging:', chrome.runtime.lastError.message);
        return;
      }
      if (!response || !response.success) {
        console.error('[FB Auto-Reply DM] Failed to log contact event to Google Sheet:', response && response.error);
      } else {
        console.log(`[FB Auto-Reply DM] Contact event '${leadEvent}' logged to Google Sheet successfully.`);
      }
    });
  }

  // Logs the other person in the current conversation to the Google Sheet
  // the first time they trigger a DM keyword rule in this conversation.
  function logDmContactIfNew(bubble) {
    const conversationKey = window.location.pathname;
    if (loggedConversationKeys.has(conversationKey)) return;

    const { name, profileUrl } = getConversationProfileInfo(bubble);
    if (!name) {
      console.warn("[FB Auto-Reply DM] Could not determine the sender's name — skipping Google Sheet log for this event.");
      return;
    }

    loggedConversationKeys.add(conversationKey);
    console.log(`[FB Auto-Reply DM] Logging new contact to Google Sheet: "${name}" (${profileUrl || 'no profile URL found'})`);
    logDmContactEvent(bubble, "DM");
  }

  async function waitForComposer(bubble, timeout = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const composer = bubble ? findComposerNearBubble(bubble) : findMessageComposer();
      if (composer) return composer;
      await new Promise(r => setTimeout(r, 200));
    }
    return null;
  }

  async function checkTextAgainstDmRules(text, bubble) {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    if (dmReplyInProgress) return; // Avoid overlapping sends into the same composer

    const lowerText = text.toLowerCase();
    
    // Wait for the composer to render. When a chat is manually opened, 
    // messages render before the composer box is mounted.
    const preferredComposer = await waitForComposer(bubble, 4000);

    try {
      for (const rule of dmState.dmRules) {
        const keyword = (rule.keyword || '').toLowerCase();

        if (keyword && lowerText.includes(keyword)) {
          const messageSteps = getDmMessageSteps(rule);
          if (messageSteps.length === 0) continue;

          console.log(`%c[FB Auto-Reply DM] DETECTED KEYWORD IN DM!`, 'color: green; font-weight: bold; font-size: 14px;');
          console.log(`- Message: "${text}"`);
          console.log(`- Matched Keyword: "${rule.keyword}"`);
          console.log(`- Action: Sending ${messageSteps.length} message(s) in sequence.`);

          logDmContactIfNew(bubble);

          dmReplyInProgress = true;
          try {
            for (let i = 0; i < messageSteps.length; i++) {
              const step = messageSteps[i];
              console.log(`[FB Auto-Reply DM] Sending step ${i + 1}/${messageSteps.length}: "${step}"`);
              const success = await sendDmReply(step, preferredComposer);
              if (!success) {
                console.error(`[FB Auto-Reply DM] Failed to send DM message step ${i + 1}/${messageSteps.length}. Stopping the sequence.`);
                break;
              }
              if (i < messageSteps.length - 1) {
                await new Promise(r => setTimeout(r, DM_SEQUENCE_STEP_DELAY_MS));
              }
            }
            console.log("[FB Auto-Reply DM] Finished DM message sequence.");
            logDmContactEvent(bubble, "Process completed");
          } finally {
            dmReplyInProgress = false;
          }

          break;
        }
      }
    } catch (err) {
      if (!isExtensionContextValid()) {
        handleInvalidatedContext();
      } else {
        console.error("[FB Auto-Reply DM] Unexpected error while checking message against DM rules:", err);
      }
    }
  }

  const COMPOSER_SELECTOR = 'div[contenteditable="true"][role="textbox"][aria-label^="Write to " i], div[contenteditable="true"][role="textbox"][aria-label*="message" i]';

  // Best guess at Messenger's message composer — a Lexical-based contenteditable,
  // same underlying technology as the Facebook comment box.
  function findMessageComposer() {
    // Messenger's real convention is aria-label="Write to <Name>" — confirmed from
    // the actual DOM. Deliberately no generic contenteditable[role=textbox] fallback:
    // this page can also have a post's comment/reply box open at the same time,
    // and grabbing that by mistake would type the DM reply into the wrong place.
    return document.querySelector('div[contenteditable="true"][role="textbox"][aria-label^="Write to " i]')
      || document.querySelector('div[contenteditable="true"][role="textbox"][aria-label*="message" i]');
  }

  // When multiple Messenger chat popups are open at once, findMessageComposer()
  // above can't tell them apart — it just grabs whichever composer appears
  // first in the page, which may belong to a different, unrelated conversation
  // than the one the new message actually arrived in. This walks up from the
  // message bubble that triggered the reply to find the smallest ancestor that
  // scopes exactly one composer — i.e. that specific chat window's own input
  // box — so the reply lands in the right conversation.
  function findComposerNearBubble(bubble) {
    let node = bubble;
    while (node && node !== document.body) {
      const composers = node.querySelectorAll(COMPOSER_SELECTOR);
      if (composers.length === 1) return composers[0];
      if (composers.length > 1) break; // this ancestor already spans more than one conversation
      node = node.parentElement;
    }
    return null;
  }

  async function sendDmReply(replyText, preferredComposer) {
    try {
      const textbox = preferredComposer || findMessageComposer();
      if (!textbox) {
        console.warn("[FB Auto-Reply DM] Could not find the message composer box.");
        return false;
      }

      const typeAttempt = async () => {
        textbox.focus();

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(textbox);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);

        const words = replyText.split(/(\s+)/);
        for (let i = 0; i < words.length; i++) {
          document.execCommand('insertText', false, words[i]);
          textbox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
          
          if (words[i].trim().length > 0) {
            const wordDelayMs = Math.floor(Math.random() * (400 - 150 + 1)) + 150;
            await new Promise(r => setTimeout(r, wordDelayMs));
          }
        }
      };

      const delayMs = Math.floor(Math.random() * (2000 - 500 + 1)) + 500;
      console.log(`[FB Auto-Reply DM] Adding random human-like delay of ${delayMs}ms before typing...`);
      await new Promise(r => setTimeout(r, delayMs));

      console.log("[FB Auto-Reply DM] Typing reply...");
      await typeAttempt();
      await new Promise(r => setTimeout(r, 400));

      let typedText = (textbox.innerText || textbox.textContent || '').trim();
      if (!typedText.includes(replyText.trim())) {
        // Something (e.g. a third-party extension like Grammarly hooking the
        // same textbox) may have cleared it — retry once before giving up.
        console.warn("[FB Auto-Reply DM] Reply text didn't land on first try, retrying once. Composer contains:", typedText);
        await typeAttempt();
        await new Promise(r => setTimeout(r, 400));

        typedText = (textbox.innerText || textbox.textContent || '').trim();
        if (!typedText.includes(replyText.trim())) {
          console.warn("[FB Auto-Reply DM] Reply text still didn't land after retry. Composer contains:", typedText);
          return false;
        }
      }

      console.log("[FB Auto-Reply DM] Submitting reply...");

      // Messenger typically shows a dedicated Send button once there's text,
      // unlike Facebook's comment box which relies on Enter-to-submit.
      // Confirmed from the real DOM: its aria-label is exactly "Press Enter to
      // send" — match that directly first (most reliable), falling back to
      // the send icon's exact SVG path if the label ever changes.
      const parentContainer = textbox.closest('form') || textbox.parentElement;
      const sendButton =
        (parentContainer && parentContainer.querySelector('div[aria-label="Press Enter to send" i][role="button"]')) ||
        document.querySelector('div[aria-label="Press Enter to send" i][role="button"]') ||
        (() => {
          const sendIconPath = (parentContainer && parentContainer.querySelector(`svg path[d="${SEND_ICON_PATH_D}"]`))
            || document.querySelector(`svg path[d="${SEND_ICON_PATH_D}"]`);
          return sendIconPath ? sendIconPath.closest('[role="button"]') : null;
        })();

      if (sendButton) {
        console.log("[FB Auto-Reply DM] Clicking send button...");
        sendButton.click();
      } else {
        for (const eventType of ['keydown', 'keypress', 'keyup']) {
          textbox.dispatchEvent(new KeyboardEvent(eventType, {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true, composed: true
          }));
        }
      }

      await new Promise(r => setTimeout(r, 1000));

      const stillHasText = textbox.isConnected &&
        (textbox.innerText || textbox.textContent || '').trim().includes(replyText.trim());
      if (stillHasText) {
        console.warn("[FB Auto-Reply DM] Reply text is still in the box after submit attempt — submission likely failed.");
        return false;
      }

      return true;
    } catch (err) {
      console.error("[FB Auto-Reply DM] Error sending DM reply:", err);
      return false;
    }
  }

  // Initialize State
  loadState();
})();
