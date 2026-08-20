// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const toggleExtension = document.getElementById('toggle-extension');
  const statusDot = document.getElementById('status-dot');
  
  const postUrlInput = document.getElementById('post-url-input');
  const addPostBtn = document.getElementById('add-post-btn');
  const postList = document.getElementById('post-list');
  
  const keywordInput = document.getElementById('keyword-input');
  const replyInput = document.getElementById('reply-input');
  const addRuleBtn = document.getElementById('add-rule-btn');
  const ruleList = document.getElementById('rule-list');

  const toggleCatchAll = document.getElementById('toggle-catchall');
  const catchAllReplyInput = document.getElementById('catchall-reply-input');
  const addCatchAllBtn = document.getElementById('add-catchall-btn');
  const catchAllList = document.getElementById('catchall-list');

  const dmKeywordInput = document.getElementById('dm-keyword-input');
  const dmReplyInput = document.getElementById('dm-reply-input');
  const addDmRuleBtn = document.getElementById('add-dm-rule-btn');
  const dmRuleList = document.getElementById('dm-rule-list');
  
  const rateLimitInput = document.getElementById('rate-limit');
  const postCount = document.getElementById('post-count');
  const replyCount = document.getElementById('reply-count');

  const logList = document.getElementById('log-list');
  const clearLogsBtn = document.getElementById('clear-logs-btn');

  // Load initial state
  chrome.storage.local.get(['isActive', 'monitoredPosts', 'rules', 'dmRules', 'catchAllReply', 'rateLimit', 'stats', 'activityLogs'], (data) => {
    const isActive = data.isActive ?? false;
    toggleExtension.checked = isActive;
    updateStatusIndicator(isActive);

    const posts = data.monitoredPosts || [];
    renderPosts(posts);
    postCount.textContent = posts.length;

    const rules = data.rules || [];
    renderRules(rules);

    const dmRules = data.dmRules || [];
    renderDmRules(dmRules);

    const catchAllReply = data.catchAllReply || { enabled: false, replies: [] };
    toggleCatchAll.checked = !!catchAllReply.enabled;
    renderCatchAllReplies(catchAllReply.replies || []);

    rateLimitInput.value = data.rateLimit || 10;

    if (data.stats) {
      replyCount.textContent = data.stats.repliesSentToday || 0;
    }

    renderLogs(data.activityLogs || []);
  });

  // Toggle extension
  toggleExtension.addEventListener('change', (e) => {
    const isActive = e.target.checked;
    chrome.storage.local.set({ isActive });
    updateStatusIndicator(isActive);
  });

  function updateStatusIndicator(isActive) {
    statusDot.className = 'status-indicator ' + (isActive ? 'active' : 'inactive');
  }

  // Add post URL
  addPostBtn.addEventListener('click', () => {
    const url = postUrlInput.value.trim();
    if (!url) return;

    chrome.storage.local.get(['monitoredPosts'], (data) => {
      const posts = data.monitoredPosts || [];
      if (!posts.includes(url)) {
        posts.push(url);
        chrome.storage.local.set({ monitoredPosts: posts }, () => {
          renderPosts(posts);
          postUrlInput.value = '';
          postCount.textContent = posts.length;
        });
      }
    });
  });

  // Render posts
  function renderPosts(posts) {
    postList.innerHTML = '';
    posts.forEach((url, index) => {
      const li = document.createElement('li');
      // Truncate URL for display
      const displayUrl = url.length > 30 ? url.substring(0, 30) + '...' : url;
      li.innerHTML = `
        <span title="${url}">${displayUrl}</span>
        <button class="delete-btn" data-index="${index}" data-type="post">🗑️</button>
      `;
      postList.appendChild(li);
    });
  }

  // A rule may have a single legacy `reply` string, or a `replies` array of
  // variants (the extension picks one at random per comment). This normalizes
  // either shape into an array for rendering/editing.
  function getReplyVariants(rule) {
    if (rule.replies && rule.replies.length) return rule.replies;
    if (rule.reply) return [rule.reply];
    return [];
  }

  // A rule may have a single legacy `keyword` string, or a `keywords` array of
  // synonyms that all trigger the same reply pool (e.g. "price"/"cost"/"how much").
  // Normalizes either shape into an array, same pattern as getReplyVariants.
  function getRuleKeywords(rule) {
    if (rule.keywords && rule.keywords.length) return rule.keywords;
    if (rule.keyword) return [rule.keyword];
    return [];
  }

  // Add rule — the keyword field accepts comma-separated synonyms (e.g.
  // "price, cost, how much") that all trigger the same rule. If a rule with
  // the exact same keyword set already exists, this adds another reply
  // variant to it instead of creating a duplicate entry.
  addRuleBtn.addEventListener('click', () => {
    const keywords = keywordInput.value.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
    const reply = replyInput.value.trim();
    if (keywords.length === 0 || !reply) return;

    chrome.storage.local.get(['rules'], (data) => {
      const rules = data.rules || [];
      const keywordSetKey = [...keywords].sort().join('|');
      const existingRule = rules.find(r => {
        const ruleKeywords = getRuleKeywords(r).map(k => k.toLowerCase());
        return [...ruleKeywords].sort().join('|') === keywordSetKey;
      });
      if (existingRule) {
        const variants = getReplyVariants(existingRule);
        variants.push(reply);
        existingRule.replies = variants;
        delete existingRule.reply;
      } else {
        rules.push({ keywords, replies: [reply] });
      }
      chrome.storage.local.set({ rules }, () => {
        renderRules(rules);
        keywordInput.value = '';
        replyInput.value = '';
      });
    });
  });

  // Render rules — shows every reply variant under its keyword, each
  // individually deletable. Deleting the last variant removes the keyword.
  function renderRules(rules) {
    ruleList.innerHTML = '';
    rules.forEach((rule, ruleIndex) => {
      const variants = getReplyVariants(rule);
      const li = document.createElement('li');
      li.style.flexDirection = 'column';
      li.style.alignItems = 'stretch';
      li.style.gap = '4px';

      const variantsHtml = variants.map((variant, variantIndex) => `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#B0B3B8; font-size:12px; flex:1;">→ ${variant}</span>
          <button class="delete-btn" data-rule-index="${ruleIndex}" data-variant-index="${variantIndex}" data-type="reply-variant">🗑️</button>
        </div>
      `).join('');

      li.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${getRuleKeywords(rule).join(', ')}</strong>
          <button class="delete-btn" data-index="${ruleIndex}" data-type="rule" title="Delete this keyword and all its reply variants">🗑️ all</button>
        </div>
        ${variantsHtml}
      `;
      ruleList.appendChild(li);
    });
  }

  // A DM rule may have a single legacy `reply` string, or a `messages` array —
  // an ordered sequence sent one after another (not randomized, unlike comment
  // reply variants) when the keyword is detected.
  function getDmMessages(rule) {
    if (rule.messages && rule.messages.length) return rule.messages;
    if (rule.reply) return [rule.reply];
    return [];
  }

  // Add DM rule — if the keyword already exists, this appends another message
  // to the end of its sequence instead of creating a duplicate keyword entry.
  addDmRuleBtn.addEventListener('click', () => {
    const keyword = dmKeywordInput.value.trim().toLowerCase();
    const reply = dmReplyInput.value.trim();
    if (!keyword || !reply) return;

    chrome.storage.local.get(['dmRules'], (data) => {
      const dmRules = data.dmRules || [];
      const existingRule = dmRules.find(r => r.keyword === keyword);
      if (existingRule) {
        const messages = getDmMessages(existingRule);
        messages.push(reply);
        existingRule.messages = messages;
        delete existingRule.reply;
      } else {
        dmRules.push({ keyword, messages: [reply] });
      }
      chrome.storage.local.set({ dmRules }, () => {
        renderDmRules(dmRules);
        dmKeywordInput.value = '';
        dmReplyInput.value = '';
      });
    });
  });

  // Render DM rules — shows every message step under its keyword, in send
  // order, each individually deletable. Deleting the last step removes the keyword.
  function renderDmRules(dmRules) {
    dmRuleList.innerHTML = '';
    dmRules.forEach((rule, ruleIndex) => {
      const messages = getDmMessages(rule);
      const li = document.createElement('li');
      li.style.flexDirection = 'column';
      li.style.alignItems = 'stretch';
      li.style.gap = '4px';

      const messagesHtml = messages.map((msg, msgIndex) => `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="color:#B0B3B8; font-size:12px; flex:1;">Step ${msgIndex + 1}: ${msg}</span>
          <button class="delete-btn" data-rule-index="${ruleIndex}" data-variant-index="${msgIndex}" data-type="dm-message-step">🗑️</button>
        </div>
      `).join('');

      li.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${rule.keyword}</strong>
          <button class="delete-btn" data-index="${ruleIndex}" data-type="dmrule" title="Delete this keyword and all its messages">🗑️ all</button>
        </div>
        ${messagesHtml}
      `;
      dmRuleList.appendChild(li);
    });
  }

  // Toggle catch-all (reply to every comment that doesn't match a keyword rule)
  toggleCatchAll.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    chrome.storage.local.get(['catchAllReply'], (data) => {
      const catchAllReply = data.catchAllReply || { enabled: false, replies: [] };
      catchAllReply.enabled = enabled;
      chrome.storage.local.set({ catchAllReply });
    });
  });

  // Add a catch-all reply variant (same random-variant pattern as keyword rules)
  addCatchAllBtn.addEventListener('click', () => {
    const reply = catchAllReplyInput.value.trim();
    if (!reply) return;

    chrome.storage.local.get(['catchAllReply'], (data) => {
      const catchAllReply = data.catchAllReply || { enabled: false, replies: [] };
      catchAllReply.replies = catchAllReply.replies || [];
      catchAllReply.replies.push(reply);
      chrome.storage.local.set({ catchAllReply }, () => {
        renderCatchAllReplies(catchAllReply.replies);
        catchAllReplyInput.value = '';
      });
    });
  });

  // Render catch-all reply variants
  function renderCatchAllReplies(replies) {
    catchAllList.innerHTML = '';
    replies.forEach((reply, index) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span>${reply}</span>
        <button class="delete-btn" data-index="${index}" data-type="catchall">🗑️</button>
      `;
      catchAllList.appendChild(li);
    });
  }

  // Handle deletions (event delegation)
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-btn')) {
      const index = parseInt(e.target.getAttribute('data-index'));
      const type = e.target.getAttribute('data-type');
      
      if (type === 'post') {
        chrome.storage.local.get(['monitoredPosts'], (data) => {
          let posts = data.monitoredPosts || [];
          posts.splice(index, 1);
          chrome.storage.local.set({ monitoredPosts: posts }, () => {
            renderPosts(posts);
            postCount.textContent = posts.length;
          });
        });
      } else if (type === 'rule') {
        chrome.storage.local.get(['rules'], (data) => {
          let rules = data.rules || [];
          rules.splice(index, 1);
          chrome.storage.local.set({ rules }, () => renderRules(rules));
        });
      } else if (type === 'dmrule') {
        chrome.storage.local.get(['dmRules'], (data) => {
          let dmRules = data.dmRules || [];
          dmRules.splice(index, 1);
          chrome.storage.local.set({ dmRules }, () => renderDmRules(dmRules));
        });
      } else if (type === 'dm-message-step') {
        const ruleIndex = parseInt(e.target.getAttribute('data-rule-index'));
        const variantIndex = parseInt(e.target.getAttribute('data-variant-index'));
        chrome.storage.local.get(['dmRules'], (data) => {
          let dmRules = data.dmRules || [];
          const rule = dmRules[ruleIndex];
          if (!rule) return;

          const messages = getDmMessages(rule);
          messages.splice(variantIndex, 1);

          if (messages.length === 0) {
            dmRules.splice(ruleIndex, 1);
          } else {
            rule.messages = messages;
            delete rule.reply;
          }
          chrome.storage.local.set({ dmRules }, () => renderDmRules(dmRules));
        });
      } else if (type === 'catchall') {
        chrome.storage.local.get(['catchAllReply'], (data) => {
          const catchAllReply = data.catchAllReply || { enabled: false, replies: [] };
          catchAllReply.replies = catchAllReply.replies || [];
          catchAllReply.replies.splice(index, 1);
          chrome.storage.local.set({ catchAllReply }, () => renderCatchAllReplies(catchAllReply.replies));
        });
      } else if (type === 'reply-variant') {
        const ruleIndex = parseInt(e.target.getAttribute('data-rule-index'));
        const variantIndex = parseInt(e.target.getAttribute('data-variant-index'));
        chrome.storage.local.get(['rules'], (data) => {
          let rules = data.rules || [];
          const rule = rules[ruleIndex];
          if (!rule) return;

          const variants = getReplyVariants(rule);
          variants.splice(variantIndex, 1);

          if (variants.length === 0) {
            rules.splice(ruleIndex, 1);
          } else {
            rule.replies = variants;
            delete rule.reply;
          }
          chrome.storage.local.set({ rules }, () => renderRules(rules));
        });
      }
    }
  });

  // Update rate limit
  rateLimitInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value);
    if (val > 0) {
      chrome.storage.local.set({ rateLimit: val });
    }
  });

  // Clear activity logs
  clearLogsBtn.addEventListener('click', () => {
    chrome.storage.local.set({ activityLogs: [] }, () => {
      renderLogs([]);
    });
  });

  function renderLogs(logs) {
    logList.innerHTML = '';
    if (logs.length === 0) {
      logList.innerHTML = '<li style="color: #80868b; text-align: center; font-size: 11px;">No activity logs yet</li>';
      return;
    }
    logs.forEach(log => {
      const li = document.createElement('li');
      li.style.flexDirection = 'column';
      li.style.alignItems = 'flex-start';
      li.style.gap = '2px';
      li.style.borderBottom = '1px solid #3c4043';
      li.style.padding = '6px 0';
      
      let statusColor = '#34a853'; // green for success
      if (log.status === 'failed') statusColor = '#ea4335'; // red
      if (log.status === 'rate-limited') statusColor = '#fbbc05'; // yellow
      
      li.innerHTML = `
        <div style="display: flex; justify-content: space-between; width: 100%; font-size: 10px; color: #80868b;">
          <span>${log.timestamp} - <strong>${log.commenter}</strong></span>
          <span style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${log.status}</span>
        </div>
        <div style="color: #e8eaed; font-size: 11px; word-break: break-all;">
          Comment: "${log.commentText}"
        </div>
        <div style="color: #8ab4f8; font-size: 11px; word-break: break-all;">
          → Keyword: <strong>${log.keyword}</strong> &bull; Replied: "${log.replyText}"
        </div>
      `;
      logList.appendChild(li);
    });
  }

  // Listen for storage changes to sync stats & logs dynamically
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      if (changes.stats) {
        replyCount.textContent = changes.stats.newValue?.repliesSentToday || 0;
      }
      if (changes.activityLogs) {
        renderLogs(changes.activityLogs.newValue || []);
      }
    }
  });

  // Import functionality
  const importBtn = document.getElementById('import-btn');
  const importFile = document.getElementById('import-file');

  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => {
      importFile.click();
    });

    importFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        parseInputFile(text);
        importFile.value = ''; // reset
      };
      reader.readAsText(file);
    });
  }

  function parseInputFile(text) {
    const lines = text.split(/\r?\n/);
    let currentSection = null;
    let newRules = [];
    let newDmRules = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.toLowerCase() === '[comments]') {
        currentSection = 'comments';
        continue;
      } else if (line.toLowerCase() === '[messenger]') {
        currentSection = 'messenger';
        continue;
      }

      if (line.includes('=')) {
        const parts = line.split('=');
        const keywordStr = parts[0].trim();
        const replyStr = parts.slice(1).join('=').trim();
        
        if (!keywordStr || !replyStr) continue;

        if (currentSection === 'comments') {
          const keywords = keywordStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          newRules.push({ keywords, replies: [replyStr] });
        } else if (currentSection === 'messenger') {
          const keywords = keywordStr.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
          for (const k of keywords) {
            newDmRules.push({ keyword: k, messages: [replyStr] });
          }
        }
      }
    }

    if (newRules.length > 0 || newDmRules.length > 0) {
      chrome.storage.local.get(['rules', 'dmRules'], (data) => {
        let rules = data.rules || [];
        let dmRules = data.dmRules || [];

        newRules.forEach(nr => {
            const keywordSetKey = [...nr.keywords].sort().join('|');
            const existingRule = rules.find(r => {
                const ruleKeywords = getRuleKeywords(r).map(k => k.toLowerCase());
                return [...ruleKeywords].sort().join('|') === keywordSetKey;
            });
            if (existingRule) {
                const variants = getReplyVariants(existingRule);
                if (!variants.includes(nr.replies[0])) {
                    variants.push(nr.replies[0]);
                }
                existingRule.replies = variants;
                delete existingRule.reply;
            } else {
                rules.push(nr);
            }
        });

        newDmRules.forEach(ndr => {
            const existingRule = dmRules.find(r => r.keyword === ndr.keyword);
            if (existingRule) {
                const messages = getDmMessages(existingRule);
                if (!messages.includes(ndr.messages[0])) {
                    messages.push(ndr.messages[0]);
                }
                existingRule.messages = messages;
                delete existingRule.reply;
            } else {
                dmRules.push(ndr);
            }
        });

        chrome.storage.local.set({ rules, dmRules }, () => {
          renderRules(rules);
          renderDmRules(dmRules);
          alert('Keywords imported successfully!');
        });
      });
    } else {
      alert('No keywords found to import. Check file format.');
    }
  }
});

