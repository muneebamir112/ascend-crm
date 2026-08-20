// content.js

console.log("FB Auto-Reply MVP: Content script loaded.");

let extensionState = {
  isActive: false,
  rules: [],
  monitoredPosts: [],
  rateLimit: 10,
  catchAllReply: { enabled: false, replies: [] }
};

const processedComments = new WeakSet();
const completedKeys = new Set();

// Containers (from either the keyword-rule path or catch-all) we've already
// posted a reply into. Used so catch-all never re-targets content nested
// inside an already-answered comment — e.g. the reply we just posted, which
// is itself a brand-new comment in Facebook's eyes and won't contain the
// original keyword. Checked via actual DOM containment (isInsideCompletedContainer
// below) rather than a Facebook-specific attribute like data-commentid, since
// that attribute isn't reliably present on every page layout (e.g. permalinks
// opened as a dialog overlay).
const completedContainers = new Set();

function isInsideCompletedContainer(element) {
  for (const container of completedContainers) {
    if (container.contains(element)) return true;
  }
  return false;
}

// When the extension is reloaded/updated during development, tabs that were
// already open lose their connection to it — every chrome.* call in this tab
// starts throwing "Extension context invalidated". Detect that instead of
// letting it fail silently/repeatedly, and tell the user to refresh.
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
    console.log('[FB Auto-Reply] Disconnected from the extension (it was reloaded/updated). Refresh this page to reconnect.');
  }
  stopMonitoring();
}

// Load state from storage
function loadState() {
  if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
  console.log("[FB Auto-Reply] Loading state from storage...");
  chrome.storage.local.get(['isActive', 'rules', 'monitoredPosts', 'rateLimit', 'catchAllReply'], (data) => {
    console.log("[FB Auto-Reply] Loaded state data:", data);
    extensionState.isActive = data.isActive ?? false;
    extensionState.rules = data.rules || [];
    extensionState.monitoredPosts = data.monitoredPosts || [];
    extensionState.rateLimit = data.rateLimit || 10;
    extensionState.catchAllReply = data.catchAllReply || { enabled: false, replies: [] };

    checkCurrentUrl();
  });
}

// Listen for changes in popup settings
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    console.log("[FB Auto-Reply] Storage changed:", changes);
    if (changes.isActive) extensionState.isActive = changes.isActive.newValue;
    if (changes.rules) extensionState.rules = changes.rules.newValue;
    if (changes.monitoredPosts) extensionState.monitoredPosts = changes.monitoredPosts.newValue;
    if (changes.rateLimit) extensionState.rateLimit = changes.rateLimit.newValue;
    if (changes.catchAllReply) extensionState.catchAllReply = changes.catchAllReply.newValue;

    checkCurrentUrl();

    // If the post is already being monitored, give comments already on the
    // page a fresh check against the just-updated rules — otherwise a
    // keyword added after a matching comment already existed would never
    // trigger, since the observer/rescan only look at newly-added DOM nodes.
    if ((changes.rules || changes.catchAllReply) && observer) {
      rescanExistingCommentsAgainstUpdatedRules();
    }
  }
});

// Check if we should be monitoring this page
async function checkCurrentUrl() {
  if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
  if (!extensionState.isActive) {
    stopMonitoring();
    return;
  }

  const currentUrl = window.location.href;
  const currentIds = extractFbIds(currentUrl);

  console.log(`[FB Auto-Reply] Checking page URL: ${currentUrl}`);
  console.log(`- Current page extracted IDs:`, currentIds);
  console.log(`- Registered Monitored URLs:`, extensionState.monitoredPosts);

  let isMonitored = false;

  for (let url of extensionState.monitoredPosts) {
    let compareUrl = url;

    // Share links (facebook.com/share/...) redirect to the real permalink.
    // Resolve them so we can compare against the URL the browser actually lands on.
    if (/\/share\//.test(url)) {
      compareUrl = await resolveShareUrl(url);
    }

    // Direct matches
    if (currentUrl.includes(compareUrl) || compareUrl.includes(currentUrl.split('?')[0])) {
      isMonitored = true;
      break;
    }

    // Match by ID extraction
    const monitoredIds = extractFbIds(compareUrl);
    if (currentIds.length > 0 && monitoredIds.length > 0 && currentIds.some(id => monitoredIds.includes(id))) {
      isMonitored = true;
      break;
    }
  }

  if (isMonitored) {
    console.log(`[FB Auto-Reply] Match found! Monitoring post: ${currentUrl}`);
    startMonitoring();
  } else {
    console.log(`[FB Auto-Reply] No match found for URL. Not monitoring.`);
    stopMonitoring();
  }
}

const shareResolutionCache = {};

// Share links (facebook.com/share/p/xxxx) redirect server-side to the real
// permalink. Follow the redirect with a same-origin fetch so we can compare
// the resolved URL's post ID against the current page.
async function resolveShareUrl(url) {
  if (shareResolutionCache[url]) return shareResolutionCache[url];
  try {
    const res = await fetch(url, { credentials: 'include' });
    const finalUrl = res.url || url;
    shareResolutionCache[url] = finalUrl;
    console.log(`[FB Auto-Reply] Resolved share URL ${url} -> ${finalUrl}`);
    return finalUrl;
  } catch (e) {
    console.warn('[FB Auto-Reply] Failed to resolve share URL:', url, e);
    return url;
  }
}

function extractFbIds(url) {
  const ids = [];
  try {
    const urlObj = new URL(url);

    const fbid = urlObj.searchParams.get('fbid');
    if (fbid) ids.push(fbid);

    const storyFbid = urlObj.searchParams.get('story_fbid');
    if (storyFbid) ids.push(storyFbid);

    const pathParts = urlObj.pathname.split('/');
    for (let part of pathParts) {
      if (/^\d{8,}$/.test(part)) {
        ids.push(part);
      } else if (/^pfbid[0-9A-Za-z]+$/i.test(part)) {
        // Modern FB permalinks use opaque pfbid tokens instead of numeric IDs
        ids.push(part);
      }
    }
  } catch (e) { }
  return ids;
}


let observer = null;
let rescanInterval = null;
const RESCAN_INTERVAL_MS = 15000;

function startMonitoring() {
  if (observer) return; // Already monitoring

  console.log("[FB Auto-Reply] Starting MutationObserver to detect new comments...");

  observer = new MutationObserver((mutations) => {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    for (let mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          // Only process element nodes
          if (node.nodeType === 1) {
            processNodeForComments(node);
          }
        });
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // Initial scan in case comments are already on page
  processNodeForComments(document.body);

  // Safety-net rescan: Facebook doesn't always insert new comments live,
  // and backgrounded tabs can delay MutationObserver callbacks, so
  // periodically re-scan the whole page as a fallback.
  rescanInterval = setInterval(() => {
    if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }
    processNodeForComments(document.body);
  }, RESCAN_INTERVAL_MS);
}

function stopMonitoring() {
  if (observer) {
    console.log("[FB Auto-Reply] Stopping MutationObserver.");
    observer.disconnect();
    observer = null;
  }
  if (rescanInterval) {
    clearInterval(rescanInterval);
    rescanInterval = null;
  }
}

const DIR_AUTO_SELECTOR = 'div[dir="auto"], span[dir="auto"]';

function processNodeForComments(rootNode) {
  // Facebook's DOM is heavily obfuscated.
  // Comments usually have dir="auto" or are inside specific roles.
  const potentialTextNodes = rootNode.querySelectorAll ? rootNode.querySelectorAll(DIR_AUTO_SELECTOR) : [];
  const elementsToProcess = Array.from(potentialTextNodes);
  if (rootNode.matches && rootNode.matches(DIR_AUTO_SELECTOR)) {
    elementsToProcess.push(rootNode);
  }

  // A comment's text is often wrapped in nested dir="auto" elements
  // (e.g. <span dir="auto"><div dir="auto">hi</div></span>) — both match the
  // selector above, which would otherwise process the same comment twice
  // concurrently. Only keep the innermost (leaf) match.
  //
  // Facebook also marks a commenter's NAME with its own dir="auto" span
  // (right next to their actual message, as a sibling, not nested) — always
  // wrapped in a clickable profile link (<a>), unlike the message body which
  // is plain text. Left unfiltered, that name gets treated as if it were the
  // comment's text: it never matches a keyword, so catch-all "replies" to a
  // person's name, and since every reply we post also has its own name
  // element, this was the real driver behind repeated/self replies.
  const leafElementsToProcess = elementsToProcess.filter(el => !el.querySelector(DIR_AUTO_SELECTOR) && !el.closest('a'));

  leafElementsToProcess.forEach(el => {
    if (processedComments.has(el)) return;

    const text = el.innerText || el.textContent;
    if (!text || text.trim().length === 0) return;

    // Mark as processed immediately to prevent duplicate checks
    processedComments.add(el);

    // Check if it matches any keyword and reply
    checkTextAgainstRules(text, el);
  });
}

// Triggered when rules/catchAllReply change while a post is already being
// monitored (see the storage.onChanged listener above). A comment that was
// already on the page and already scanned once (with no match, under the
// old rules) would otherwise never get a second look, since the observer and
// periodic rescan only process newly-added DOM nodes. This deliberately does
// NOT check or set `processedComments` — it re-checks every comment
// currently on the page against the updated rules, and relies entirely on
// the existing dedup (completedKeys/completedContainers/keysInFlight/etc.,
// all keyed by comment identity, not by "has this element been seen before")
// to make sure comments already replied to are correctly left alone.
function rescanExistingCommentsAgainstUpdatedRules() {
  const potentialTextNodes = document.body.querySelectorAll(DIR_AUTO_SELECTOR);
  const leafElementsToProcess = Array.from(potentialTextNodes).filter(el =>
    !el.querySelector(DIR_AUTO_SELECTOR) && !el.closest('a')
  );

  leafElementsToProcess.forEach(el => {
    const text = el.innerText || el.textContent;
    if (!text || text.trim().length === 0) return;
    checkTextAgainstRules(text, el);
  });
}

function getCommentKey(commentContainer, commenterName, commentText) {
  // 1. Try to get data-commentid attribute
  const commentId = commentContainer.getAttribute('data-commentid');
  if (commentId) return `id_${commentId}`;

  // 2. Try to find a link containing comment_id in href
  const links = commentContainer.querySelectorAll('a[href*="comment_id="]');
  for (let link of links) {
    try {
      const href = link.getAttribute('href');
      const url = new URL(href, window.location.href);
      const cid = url.searchParams.get('comment_id');
      if (cid) return `id_${cid}`;
    } catch (e) { }
  }

  // 3. Fallback to commenterName + commentText
  return `${commenterName}_${commentText.trim()}`.substring(0, 200);
}

const containersInFlight = new WeakSet();
const keysInFlight = new Set();
const failedAttemptCounts = new Map();
const MAX_ATTEMPTS_PER_COMMENT = 3;

// A rule may have a single legacy `reply` string, or a `replies` array of
// variants (one is picked at random per comment, so different commenters
// don't all get the identical text). Normalizes either shape into an array.
function getRuleReplyVariants(rule) {
  if (rule.replies && rule.replies.length) return rule.replies;
  if (rule.reply) return [rule.reply];
  return [];
}

// A rule may have a single legacy `keyword` string, or a `keywords` array of
// synonyms that all trigger the same reply pool (e.g. "price"/"cost"/"how much").
// Normalizes either shape into an array, same pattern as getRuleReplyVariants.
function getRuleKeywords(rule) {
  if (rule.keywords && rule.keywords.length) return rule.keywords;
  if (rule.keyword) return [rule.keyword];
  return [];
}

// Same variants-array shape as a keyword rule's replies, just sourced from
// the catch-all settings instead of a specific rule.
function getCatchAllReplyVariants() {
  return (extensionState.catchAllReply && extensionState.catchAllReply.replies) || [];
}

// True if lowerText is (or ends with) one of our own configured reply texts.
// Facebook prepends an "@Name " mention to a reply's visible text when you
// reply to someone (e.g. our reply "send me dm" is shown as "Muneeb Amir
// send me dm") — an exact-match check alone misses that, which let the bot's
// own replies slip past the own-reply guard and get replied to again.
function isOwnReplyText(lowerText, reply) {
  const normalizedReply = reply.trim().toLowerCase();
  if (!normalizedReply) return false;
  return lowerText === normalizedReply || lowerText.endsWith(normalizedReply);
}

async function checkTextAgainstRules(text, element) {
  if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }

  const lowerText = text.toLowerCase().trim();
  let lockedContainer = null;
  let lockedKey = null;
  let matchedKeyword = false;

  // Don't process our own replies — prevents infinite loops when a reply
  // text contains the keyword (e.g. keyword "test", reply "tested").
  const isOwnReply = extensionState.rules.some(r =>
    getRuleReplyVariants(r).some(reply => isOwnReplyText(lowerText, reply))
  ) || getCatchAllReplyVariants().some(reply => isOwnReplyText(lowerText, reply));
  if (isOwnReply) return;

  try {
    for (let rule of extensionState.rules) {
      // A rule can list several keyword synonyms (e.g. "price"/"cost"/"how much")
      // that all trigger the same reply pool — match against whichever one hits first.
      const matchedKeywordText = getRuleKeywords(rule).find(k => lowerText.includes(k.toLowerCase()));

      if (matchedKeywordText) {
        matchedKeyword = true;
        const replyOptions = getRuleReplyVariants(rule);
        const chosenReply = replyOptions[Math.floor(Math.random() * replyOptions.length)];

        const commentContainer = findCommentContainer(element);
        if (!commentContainer) {
          console.warn(`[FB Auto-Reply] Keyword "${matchedKeywordText}" matched but couldn't locate the comment's container. Text: "${text.substring(0, 50)}"`);
          continue;
        }

        // Guard against the same comment being picked up twice (e.g. nested
        // dir="auto" wrappers, or overlapping MutationObserver batches).
        if (containersInFlight.has(commentContainer)) {
          console.log(`[FB Auto-Reply] Already handling this comment container, skipping duplicate: "${text.substring(0, 30)}..."`);
          continue;
        }
        containersInFlight.add(commentContainer);
        lockedContainer = commentContainer;

        const commenterName = getCommenterName(commentContainer);
        const commentKey = getCommentKey(commentContainer, commenterName, text);

        // Permanent in-memory dedup: survives Facebook DOM re-renders
        if (completedKeys.has(commentKey)) {
          console.log(`[FB Auto-Reply] Comment key already completed, skipping: ${commentKey}`);
          continue;
        }

        if (keysInFlight.has(commentKey)) {
          console.log(`[FB Auto-Reply] Reply for key ${commentKey} is already in-flight. Skipping duplicate.`);
          continue;
        }
        keysInFlight.add(commentKey);
        lockedKey = commentKey;

        const alreadyReplied = await hasAlreadyReplied(commentContainer, text, chosenReply, commentKey);
        if (alreadyReplied) {
          completedKeys.add(commentKey);
          console.log(`[FB Auto-Reply] Already replied to comment: "${text.substring(0, 30)}..."`);
          continue;
        }

        const failCount = failedAttemptCounts.get(commentKey) || 0;
        if (failCount >= MAX_ATTEMPTS_PER_COMMENT) {
          console.log(`[FB Auto-Reply] Giving up on this comment after ${failCount} failed attempts: "${text.substring(0, 30)}..."`);
          continue;
        }

        const allowed = await canSendReply();
        if (!allowed) {
          console.log(`[FB Auto-Reply] Rate limit reached. Skipping reply.`);
          await addActivityLog(commenterName, text, matchedKeywordText, chosenReply, "rate-limited");
          continue;
        }

        console.log(`%c[FB Auto-Reply] DETECTED KEYWORD!`, 'color: green; font-weight: bold; font-size: 14px;');
        console.log(`- Original Comment: "${text}"`);
        console.log(`- Matched Keyword: "${matchedKeywordText}"`);
        console.log(`- Action: Replying with -> "${chosenReply}" (chosen from ${replyOptions.length} variant(s))`);

        // Mark the container as completed BEFORE sending, not after — triggerReply
        // takes several seconds (typing + submit + verification), and Facebook
        // renders the new reply into the page well before that resolves. Marking
        // only on success left a window where the reply we're actively sending
        // gets picked up as a "new" unmatched comment and replied to a second time.
        completedContainers.add(commentContainer);

        const success = await triggerReply(commentContainer, text, chosenReply);
        if (success) {
          completedKeys.add(commentKey);
          await recordReplySent();
          await markAsReplied(commentKey);
          await addActivityLog(commenterName, text, matchedKeywordText, chosenReply, "success");
          console.log(`[FB Auto-Reply] Successfully replied!`);
          
          // Log to Google Sheet with "Comments" status
          chrome.runtime.sendMessage({ type: 'LOG_DM_CONTACT', name: commenterName, profileUrl: "", leadEvent: "Comments" });
        } else {
          failedAttemptCounts.set(commentKey, failCount + 1);
          await addActivityLog(commenterName, text, matchedKeywordText, chosenReply, "failed");
          console.error(`[FB Auto-Reply] Failed to send reply. (attempt ${failCount + 1}/${MAX_ATTEMPTS_PER_COMMENT})`);
        }

        break;
      }
    }
  } catch (err) {
    if (!isExtensionContextValid()) {
      handleInvalidatedContext();
    } else {
      console.error("[FB Auto-Reply] Unexpected error while checking comment against rules:", err);
    }
  } finally {
    if (lockedContainer) containersInFlight.delete(lockedContainer);
    if (lockedKey) keysInFlight.delete(lockedKey);
  }

  // No keyword rule matched this comment — fall back to the catch-all reply
  // (if the user has enabled "Reply to Every Comment" in the popup).
  if (!matchedKeyword) {
    await checkTextAgainstCatchAll(text, element);
  }
}

// Finds the reply we just posted inside commentContainer (by matching its
// exact text) and marks it so the MutationObserver's next pass never treats
// it as a fresh, unrelated comment — the primary defense for the common case
// where Facebook keeps the same DOM node around.
function suppressOwnReplyFromReprocessing(commentContainer, chosenReply) {
  const normalizedReply = chosenReply.trim();
  const candidates = commentContainer.querySelectorAll(DIR_AUTO_SELECTOR);
  candidates.forEach(node => {
    const nodeText = (node.innerText || node.textContent || '').trim();
    if (nodeText === normalizedReply) processedComments.add(node);
  });
}

// Mirrors the keyword-matching reply flow in checkTextAgainstRules above
// (container lookup, dedup, rate limiting, activity log), but is used for
// comments that didn't match any keyword rule.
async function checkTextAgainstCatchAll(text, element) {
  if (!extensionState.catchAllReply || !extensionState.catchAllReply.enabled) return;

  const replyOptions = getCatchAllReplyVariants();
  if (replyOptions.length === 0) return;

  if (!isExtensionContextValid()) { handleInvalidatedContext(); return; }

  // Facebook nests a comment's replies (including ones we post) inside a
  // [role="group"] container within that comment. Catch-all must only ever
  // target top-level comments — otherwise, after posting a reply, that reply
  // itself gets scanned as "just another comment with no keyword match" and
  // gets replied to as well, cascading into a runaway self-reply loop under
  // the same comment.
  if (element.closest('[role="group"]')) return;

  // Structural backstop for the same problem, independent of the role="group"
  // guess above: skip anything nested inside a comment we've already replied
  // to (via either the keyword-rule path or catch-all itself), regardless of
  // who posted it or whether Facebook exposes data-commentid on this layout.
  if (isInsideCompletedContainer(element)) return;

  let lockedContainer = null;
  let lockedKey = null;

  try {
    const chosenReply = replyOptions[Math.floor(Math.random() * replyOptions.length)];

    const commentContainer = findCommentContainer(element);
    if (!commentContainer) {
      console.warn(`[FB Auto-Reply] Catch-all reply matched but couldn't locate the comment's container. Text: "${text.substring(0, 50)}"`);
      return;
    }

    if (containersInFlight.has(commentContainer)) {
      console.log(`[FB Auto-Reply] Already handling this comment container, skipping duplicate: "${text.substring(0, 30)}..."`);
      return;
    }
    containersInFlight.add(commentContainer);
    lockedContainer = commentContainer;

    const commenterName = getCommenterName(commentContainer);
    const commentKey = getCommentKey(commentContainer, commenterName, text);

    if (completedKeys.has(commentKey)) {
      console.log(`[FB Auto-Reply] Comment key already completed, skipping: ${commentKey}`);
      return;
    }

    if (keysInFlight.has(commentKey)) {
      console.log(`[FB Auto-Reply] Reply for key ${commentKey} is already in-flight. Skipping duplicate.`);
      return;
    }
    keysInFlight.add(commentKey);
    lockedKey = commentKey;

    const alreadyReplied = await hasAlreadyReplied(commentContainer, text, chosenReply, commentKey);
    if (alreadyReplied) {
      completedKeys.add(commentKey);
      console.log(`[FB Auto-Reply] Already replied to comment: "${text.substring(0, 30)}..."`);
      return;
    }

    const failCount = failedAttemptCounts.get(commentKey) || 0;
    if (failCount >= MAX_ATTEMPTS_PER_COMMENT) {
      console.log(`[FB Auto-Reply] Giving up on this comment after ${failCount} failed attempts: "${text.substring(0, 30)}..."`);
      return;
    }

    const allowed = await canSendReply();
    if (!allowed) {
      console.log(`[FB Auto-Reply] Rate limit reached. Skipping reply.`);
      await addActivityLog(commenterName, text, "(catch-all)", chosenReply, "rate-limited");
      return;
    }

    console.log(`%c[FB Auto-Reply] CATCH-ALL REPLY (no keyword matched)`, 'color: green; font-weight: bold; font-size: 14px;');
    console.log(`- Original Comment: "${text}"`);
    console.log(`- Action: Replying with -> "${chosenReply}" (chosen from ${replyOptions.length} variant(s))`);

    // Mark the container as completed BEFORE sending — see the identical
    // comment in checkTextAgainstRules for why this has to happen before
    // triggerReply, not after it resolves.
    completedContainers.add(commentContainer);

    const success = await triggerReply(commentContainer, text, chosenReply);
    if (success) {
      completedKeys.add(commentKey);
      await recordReplySent();
      await markAsReplied(commentKey);
      await addActivityLog(commenterName, text, "(catch-all)", chosenReply, "success");
      console.log(`[FB Auto-Reply] Successfully replied!`);

      // Log to Google Sheet with "Comments" status
      chrome.runtime.sendMessage({ type: 'LOG_DM_CONTACT', name: commenterName, profileUrl: "", leadEvent: "Comments" });

      // Give Facebook a moment to render the reply we just posted, then mark
      // it so it never gets rescanned as if it were someone else's new comment.
      await new Promise(r => setTimeout(r, 800));
      suppressOwnReplyFromReprocessing(commentContainer, chosenReply);
    } else {
      failedAttemptCounts.set(commentKey, failCount + 1);
      await addActivityLog(commenterName, text, "(catch-all)", chosenReply, "failed");
      console.error(`[FB Auto-Reply] Failed to send reply. (attempt ${failCount + 1}/${MAX_ATTEMPTS_PER_COMMENT})`);
    }
  } catch (err) {
    if (!isExtensionContextValid()) {
      handleInvalidatedContext();
    } else {
      console.error("[FB Auto-Reply] Unexpected error while checking comment against catch-all reply:", err);
    }
  } finally {
    if (lockedContainer) containersInFlight.delete(lockedContainer);
    if (lockedKey) keysInFlight.delete(lockedKey);
  }
}

async function addActivityLog(commenter, commentText, keyword, replyText, status) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['activityLogs'], (data) => {
      let logs = data.activityLogs || [];
      const newLog = {
        timestamp: new Date().toLocaleTimeString(),
        commenter: commenter || "Unknown",
        commentText: (commentText || "").substring(0, 100),
        keyword: keyword || "",
        replyText: replyText || "",
        status: status // "success" | "failed" | "rate-limited"
      };

      logs.unshift(newLog); // Add to the top

      // Limit to 50 logs
      if (logs.length > 50) {
        logs = logs.slice(0, 50);
      }

      chrome.storage.local.set({ activityLogs: logs }, () => {
        resolve();
      });
    });
  });
}


// How many ancestor levels the fallback walk below is allowed to climb
// before giving up. Genuine comments resolve within a handful of levels —
// without a cap, text with no real comment structure nearby (e.g. a
// "Notifications" label in the notifications flyout) can climb all the way
// up until it happens to hit some unrelated ancestor that merely CONTAINS a
// "reply"-labeled element somewhere in its subtree, and get misidentified as
// a comment container.
const MAX_CONTAINER_CLIMB_LEVELS = 12;

function findCommentContainer(el) {
  // Facebook wraps a comment's header, text, and action row (Like/Reply) in an
  // outer div[data-commentid]. The role="article" block only covers the header+text,
  // NOT the Like/Reply row (which is a sibling), so prefer data-commentid when present.
  const byCommentId = el.closest && el.closest('[data-commentid]');
  if (byCommentId) return byCommentId;

  let parent = el.parentElement;
  let levels = 0;
  while (parent && parent !== document.body && levels < MAX_CONTAINER_CLIMB_LEVELS) {
    if (parent.getAttribute('role') === 'article' || parent.tagName === 'ARTICLE') {
      // Return the parent container of the article so that siblings (like action rows/Reply button) are included.
      return parent.parentElement || parent;
    }
    if (parent.querySelector('[aria-label*="Reply" i]') || parent.querySelector('[aria-label*="reply" i]')) {
      return parent;
    }
    parent = parent.parentElement;
    levels++;
  }
  return null;
}

function findReplyButton(container) {
  const findInNode = (node) => {
    // 1. Try aria-label containing Reply
    const replyByAria = node.querySelector('[aria-label*="Reply" i], [aria-label*="reply" i]');
    if (replyByAria) return replyByAria;

    // 2. Try buttons/spans/divs with Reply text
    const buttons = node.querySelectorAll('div[role="button"], span[role="button"], button, a, div[tabindex="0"]');
    for (let btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if (text === 'reply' || text === 'répondre' || text === 'responder') {
        return btn;
      }
    }

    // 3. Fallback tree walker
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let txtNode;
    while (txtNode = walker.nextNode()) {
      const txt = txtNode.textContent.trim().toLowerCase();
      if (txt === 'reply') {
        return txtNode.parentElement;
      }
    }
    return null;
  };

  // Try in the container first
  let btn = findInNode(container);
  if (btn) return btn;

  // Fallback to searching the parent element
  if (container.parentElement) {
    btn = findInNode(container.parentElement);
    if (btn) return btn;
  }

  return null;
}

function waitForReplyInput(container, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const check = () => {
      const textbox = container.querySelector('div[contenteditable="true"][role="textbox"]');
      if (textbox) {
        resolve(textbox);
      } else if (Date.now() - startTime < timeout) {
        setTimeout(check, 100);
      } else {
        const globalTextbox = document.activeElement && document.activeElement.matches('div[contenteditable="true"][role="textbox"]') ? document.activeElement : null;
        resolve(globalTextbox);
      }
    };
    check();
  });
}

async function triggerReply(commentContainer, commentText, replyText) {
  try {
    const replyBtn = findReplyButton(commentContainer);
    if (!replyBtn) {
      console.warn("[FB Auto-Reply] Could not find Reply button.");
      return false;
    }

    console.log("[FB Auto-Reply] Clicking Reply button...");
    replyBtn.click();

    const textbox = await waitForReplyInput(commentContainer);
    if (!textbox) {
      console.warn("[FB Auto-Reply] Could not locate reply textbox.");
      return false;
    }

    const existingText = (textbox.innerText || textbox.textContent || '').trim();
    if (existingText.includes(replyText.trim())) {
      // A previous attempt already typed this in (submission failed and left
      // it sitting there) — don't type it again, just retry submitting.
      console.log("[FB Auto-Reply] Reply text already present in box from a previous attempt, skipping re-typing.");
    } else {
      const delayMs = Math.floor(Math.random() * (12000 - 3000 + 1)) + 3000;
      console.log(`[FB Auto-Reply] Adding random human-like delay of ${delayMs}ms before typing...`);
      await new Promise(r => setTimeout(r, delayMs));

      console.log("[FB Auto-Reply] Typing reply...");
      textbox.focus();

      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(textbox);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      for (let i = 0; i < replyText.length; i++) {
        document.execCommand('insertText', false, replyText[i]);
        textbox.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        
        // Random delay between 50ms and 150ms between keystrokes
        const charDelayMs = Math.floor(Math.random() * (150 - 50 + 1)) + 50;
        await new Promise(r => setTimeout(r, charDelayMs));
      }
    }

    await new Promise(r => setTimeout(r, 400));

    const typedText = (textbox.innerText || textbox.textContent || '').trim();
    if (!typedText.includes(replyText.trim())) {
      console.warn("[FB Auto-Reply] Reply text didn't land in the textbox as expected. Textbox contains:", typedText);
      return false;
    }

    console.log("[FB Auto-Reply] Submitting reply...");

    // Prefer an explicit send/post button — a synthetic Enter keypress often isn't
    // recognized as a "real" keystroke by Facebook's rich text editor (Lexical).
    // Facebook renders the active composer's submit button under
    // #focused-state-composer-submit while it has focus.
    const parentContainer = textbox.closest('form') || textbox.parentElement;
    const sendButton =
      (parentContainer && parentContainer.querySelector('#focused-state-composer-submit div[role="button"]')) ||
      document.querySelector('#focused-state-composer-submit div[role="button"]') ||
      (parentContainer && parentContainer.querySelector('div[role="button"][aria-label*="send" i], div[role="button"][aria-label*="post" i], div[role="button"][aria-label*="comment" i], button[type="submit"]'));

    if (sendButton) {
      console.log("[FB Auto-Reply] Clicking send button...");
      sendButton.click();
    } else {
      for (const eventType of ['keydown', 'keypress', 'keyup']) {
        textbox.dispatchEvent(new KeyboardEvent(eventType, {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true, composed: true
        }));
      }
    }

    // Verify over a period of 4 seconds (checking every 500ms) to see if the textbox clears or disappears.
    // This handles slower page updates or network latency gracefully without raising false failures.
    let submittedSuccessfully = false;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 500));
      const textStillPresent = textbox.isConnected &&
        (textbox.innerText || textbox.textContent || '').trim().includes(replyText.trim());
      if (!textStillPresent) {
        submittedSuccessfully = true;
        break;
      }
    }

    if (!submittedSuccessfully) {
      console.warn("[FB Auto-Reply] Reply text is still in the box after submit attempt — submission likely failed.");
      return false;
    }

    return true;
  } catch (err) {
    console.error("[FB Auto-Reply] Error replying:", err);
    return false;
  }
}

function getCommenterName(commentContainer) {
  // 1. Try typical nested structure first
  const nameElement = commentContainer.querySelector('a[role="link"] > span > span, a[role="link"] > strong, a[href*="/user/"], a[href*="/profile.php"]');
  if (nameElement && nameElement.textContent.trim()) return nameElement.textContent.trim();

  // 2. Try generic link matching inside the container
  const links = commentContainer.querySelectorAll('a[role="link"], a[href*="/user/"], a[href*="/profile.php"], a[href*="/permalink.php"], a[href*="/posts/"], a[href*="/photos/"]');
  for (let link of links) {
    const text = link.textContent.trim();
    // Exclude common action keywords or timestamp-like text
    if (text && text.length > 1 && !/^(like|reply|share|translate|write a reply|view|replying|replied|\d+h|\d+m|\d+d|\d+w|just now)/i.test(text)) {
      return text;
    }
  }

  // 3. Fallback to style-based selectors
  const boldEl = commentContainer.querySelector('span[style*="font-weight: 600"], span[style*="font-weight: bold"], strong');
  if (boldEl && boldEl.textContent.trim()) return boldEl.textContent.trim();

  return "UnknownUser";
}

async function hasAlreadyReplied(commentContainer, commentText, replyText, commentKey) {
  const containerText = commentContainer.innerText || '';
  const normalizedReply = replyText.trim().toLowerCase();

  return new Promise((resolve) => {
    chrome.storage.local.get(['repliedComments'], (data) => {
      const replied = data.repliedComments || {};
      if (replied[commentKey]) {
        resolve(true);
        return;
      }

      const repliesContainer = commentContainer.querySelector('[role="group"]');
      if (repliesContainer && repliesContainer.innerText.toLowerCase().includes(normalizedReply)) {
        replied[commentKey] = Date.now();
        chrome.storage.local.set({ repliedComments: replied });
        resolve(true);
        return;
      }

      resolve(false);
    });
  });
}

async function markAsReplied(commentKey) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['repliedComments'], (data) => {
      const replied = data.repliedComments || {};
      replied[commentKey] = Date.now();
      chrome.storage.local.set({ repliedComments: replied }, () => {
        resolve();
      });
    });
  });
}

async function canSendReply() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['rateLimit', 'replyTimestamps'], (data) => {
      const limit = data.rateLimit || 10;
      let timestamps = data.replyTimestamps || [];
      const now = Date.now();

      timestamps = timestamps.filter(ts => now - ts < 3600000);

      if (timestamps.length >= limit) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

async function recordReplySent() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['replyTimestamps', 'stats'], (data) => {
      let timestamps = data.replyTimestamps || [];
      const now = Date.now();
      timestamps.push(now);

      const stats = data.stats || { repliesSentToday: 0 };
      stats.repliesSentToday = (stats.repliesSentToday || 0) + 1;

      chrome.storage.local.set({ replyTimestamps: timestamps, stats }, () => {
        resolve();
      });
    });
  });
}

// Facebook is a single-page app: navigating between posts often doesn't
// trigger a full page load, so re-check whenever the SPA router changes the URL.
(function watchForUrlChanges() {
  const _pushState = history.pushState;
  const _replaceState = history.replaceState;

  history.pushState = function (...args) {
    _pushState.apply(this, args);
    window.dispatchEvent(new Event('fb-auto-reply-locationchange'));
  };
  history.replaceState = function (...args) {
    _replaceState.apply(this, args);
    window.dispatchEvent(new Event('fb-auto-reply-locationchange'));
  };
  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('fb-auto-reply-locationchange'));
  });
  window.addEventListener('fb-auto-reply-locationchange', () => {
    console.log('[FB Auto-Reply] URL changed via SPA navigation, re-checking...');
    checkCurrentUrl();
  });
})();

// Initialize State
loadState();

