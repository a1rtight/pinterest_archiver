// Pinterest Archiver Bookmarklet
// Downloads pin images into a single zip file with section support

(function() {
  var e = document.getElementById('pa-overlay');
  if (e) { e.remove(); return; }

  var totalPins = 0;
  var boardName = '';
  var boardSections = [];
  var currentSection = null;

  // Streaming download state
  var isPlaying = false;
  var isPaused = false;
  var downloadedFiles = [];
  var downloadedPinIds = new Set();
  var pinQueue = []; // Pins waiting to download
  var activeDownloads = 0;
  var MAX_PARALLEL = 10;
  var scrollAbort = false;
  var fileCounter = 0;
  var safeName = '';

  var s = document.createElement('style');
  s.id = 'pa-styles';
  s.textContent = '#pa-overlay{position:fixed;top:20px;right:20px;width:340px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.2);z-index:999999;font-family:system-ui,sans-serif;color:#333;max-height:90vh;overflow:auto}#pa-overlay *{box-sizing:border-box}.pa-h{padding:16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff}.pa-h h2{margin:0;font-size:16px}.pa-x{background:none;border:none;font-size:20px;cursor:pointer;color:#666}.pa-c{padding:16px}.pa-i{margin-bottom:16px}.pa-n{font-size:18px;font-weight:600;margin-bottom:4px}.pa-p{font-size:14px;color:#666}.pa-t{font-size:12px;color:#888;margin:12px 0 8px;text-transform:uppercase}.pa-b{display:block;width:100%;padding:12px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:14px;cursor:pointer}.pa-b:hover{background:#f5f5f5}.pa-b:disabled{opacity:.5}.pa-bp{background:#e60023;color:#fff;border-color:#e60023}.pa-bp:hover{background:#ad081b}.pa-bg{background:#28a745;color:#fff;border-color:#28a745}.pa-bg:hover{background:#218838}.pa-by{background:#ffc107;color:#333;border-color:#ffc107}.pa-by:hover{background:#e0a800}.pa-r{display:flex;gap:8px}.pa-r .pa-b{flex:1;margin:0}.pa-s{padding:12px;background:#f8f8f8;border-radius:8px;font-size:13px;color:#666;margin-top:12px;display:none}.pa-s.on{display:block}.pa-g{height:4px;background:#eee;border-radius:2px;margin-top:8px}.pa-gb{height:100%;background:#e60023;width:0;transition:width .3s}.pa-m{background:#fff3cd;padding:10px;border-radius:8px;font-size:12px;margin-top:12px;display:none}.pa-m.on{display:block}@keyframes pa-spin{to{transform:rotate(360deg)}}.pa-live{display:inline-block;width:8px;height:8px;background:#28a745;border-radius:50%;margin-right:6px;animation:pa-pulse 1s infinite}.pa-paused{background:#ffc107;animation:none}@keyframes pa-pulse{0%,100%{opacity:1}50%{opacity:0.5}}';
  document.head.appendChild(s);

  function createZip(files) {
    var localHeaders = [];
    var centralHeaders = [];
    var offset = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var nameBytes = new TextEncoder().encode(file.name);
      var data = new Uint8Array(file.data);
      var local = new Uint8Array(30 + nameBytes.length + data.length);
      var view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true);
      view.setUint16(4, 20, true);
      view.setUint16(6, 0, true);
      view.setUint16(8, 0, true);
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      view.setUint32(14, file.crc, true);
      view.setUint32(18, data.length, true);
      view.setUint32(22, data.length, true);
      view.setUint16(26, nameBytes.length, true);
      view.setUint16(28, 0, true);
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      localHeaders.push(local);
      var central = new Uint8Array(46 + nameBytes.length);
      var cview = new DataView(central.buffer);
      cview.setUint32(0, 0x02014b50, true);
      cview.setUint16(4, 20, true);
      cview.setUint16(6, 20, true);
      cview.setUint16(8, 0, true);
      cview.setUint16(10, 0, true);
      cview.setUint16(12, 0, true);
      cview.setUint16(14, 0, true);
      cview.setUint32(16, file.crc, true);
      cview.setUint32(20, data.length, true);
      cview.setUint32(24, data.length, true);
      cview.setUint16(28, nameBytes.length, true);
      cview.setUint16(30, 0, true);
      cview.setUint16(32, 0, true);
      cview.setUint16(34, 0, true);
      cview.setUint16(36, 0, true);
      cview.setUint32(38, 0, true);
      cview.setUint32(42, offset, true);
      central.set(nameBytes, 46);
      centralHeaders.push(central);
      offset += local.length;
    }
    var centralSize = centralHeaders.reduce(function(a, b) { return a + b.length; }, 0);
    var endRecord = new Uint8Array(22);
    var eview = new DataView(endRecord.buffer);
    eview.setUint32(0, 0x06054b50, true);
    eview.setUint16(4, 0, true);
    eview.setUint16(6, 0, true);
    eview.setUint16(8, files.length, true);
    eview.setUint16(10, files.length, true);
    eview.setUint32(12, centralSize, true);
    eview.setUint32(16, offset, true);
    eview.setUint16(20, 0, true);
    var totalSize = offset + centralSize + 22;
    var zip = new Uint8Array(totalSize);
    var pos = 0;
    for (var j = 0; j < localHeaders.length; j++) {
      zip.set(localHeaders[j], pos);
      pos += localHeaders[j].length;
    }
    for (var k = 0; k < centralHeaders.length; k++) {
      zip.set(centralHeaders[k], pos);
      pos += centralHeaders[k].length;
    }
    zip.set(endRecord, pos);
    return zip;
  }

  var crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      crcTable[n] = c;
    }
    return crcTable;
  }

  function crc32(data) {
    var table = getCrcTable();
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function getBoardInfo() {
    var selectors = ['[data-test-id="board-name"]', 'h1', '[role="heading"]'];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        boardName = el.textContent.trim();
        break;
      }
    }
    var pc = document.querySelector('[data-test-id="pin-count"]');
    if (pc) {
      var m = pc.textContent.match(/[\d,]+/);
      if (m) totalPins = parseInt(m[0].replace(/,/g, ''), 10);
    }
    if (!totalPins) totalPins = document.querySelectorAll('[data-test-id="pin"]').length || 0;
    if (!boardName) {
      var p = location.pathname.split('/').filter(Boolean);
      boardName = p[p.length - 1] || 'board';
    }
    var pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 3) {
      var thirdPart = pathParts[2];
      var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize'];
      if (systemRoutes.indexOf(thirdPart) === -1) {
        currentSection = decodeURIComponent(thirdPart).replace(/-/g, ' ');
      }
    }
    return { n: boardName, t: totalPins, section: currentSection };
  }

  function detectSections() {
    boardSections = [];
    var pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return boardSections;
    var username = pathParts[0];
    var boardSlug = pathParts[1];
    var boardPath = '/' + username + '/' + boardSlug;
    var sectionMap = new Map();
    var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize', 'organise', 'collaborators', 'invites', 'see', 'see-pins', 'see_pins', 'ideas', 'search', 'notifications', 'messages', 'create', 'board', 'pin', 'user', 'about', 'terms', 'privacy', 'help', 'contact'];
    try {
      var scripts = document.querySelectorAll('script');
      scripts.forEach(function(script) {
        var text = script.textContent || '';
        if (text.length < 100) return;
        var sectionPattern = /"slug"\s*:\s*"([^"]+)"[^}]*?"__typename"\s*:\s*"BoardSection"/g;
        var match;
        while ((match = sectionPattern.exec(text)) !== null) {
          var slug = match[1];
          if (!slug || systemRoutes.indexOf(slug) !== -1) continue;
          if (slug.match(/^[\d]+$/) || slug.length > 100) continue;
          var start = Math.max(0, match.index - 300);
          var end = Math.min(text.length, match.index + 500);
          var context = text.slice(start, end);
          var pinCount = 0;
          var pinCountMatch = context.match(/"pin_count"\s*:\s*(\d+)/);
          if (pinCountMatch) pinCount = parseInt(pinCountMatch[1], 10);
          var name = decodeURIComponent(slug).replace(/-/g, ' ');
          var titleMatch = context.match(/"title"\s*:\s*"([^"]+)"/);
          if (titleMatch) name = titleMatch[1];
          if (!sectionMap.has(slug)) {
            sectionMap.set(slug, { name: name, pinCount: pinCount });
          }
        }
        var reversePattern = /"__typename"\s*:\s*"BoardSection"[^}]*?"slug"\s*:\s*"([^"]+)"/g;
        while ((match = reversePattern.exec(text)) !== null) {
          var slug = match[1];
          if (!slug || systemRoutes.indexOf(slug) !== -1) continue;
          if (slug.match(/^[\d]+$/) || slug.length > 100) continue;
          if (!sectionMap.has(slug)) {
            var start = Math.max(0, match.index - 300);
            var end = Math.min(text.length, match.index + 500);
            var context = text.slice(start, end);
            var pinCount = 0;
            var pinCountMatch = context.match(/"pin_count"\s*:\s*(\d+)/);
            if (pinCountMatch) pinCount = parseInt(pinCountMatch[1], 10);
            var name = decodeURIComponent(slug).replace(/-/g, ' ');
            var titleMatch = context.match(/"title"\s*:\s*"([^"]+)"/);
            if (titleMatch) name = titleMatch[1];
            sectionMap.set(slug, { name: name, pinCount: pinCount });
          }
        }
      });
    } catch (e) {}
    var allLinks = document.querySelectorAll('a[href]');
    allLinks.forEach(function(link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf(boardPath + '/') === 0) {
        var remainder = href.slice(boardPath.length + 1).split('/')[0].split('?')[0];
        if (remainder && remainder.length > 2 && remainder.length < 80) {
          if (systemRoutes.indexOf(remainder) === -1 && !remainder.match(/^[\d]+$/)) {
            var container = link.closest('[data-test-id]') || link.parentElement?.parentElement?.parentElement;
            if (container) {
              var containerText = container.textContent || '';
              var countMatch = containerText.match(/(\d+)\s*(?:pins?|Pins?)/i);
              if (countMatch) {
                var pinCount = parseInt(countMatch[1], 10);
                var name = decodeURIComponent(remainder).replace(/-/g, ' ');
                if (!sectionMap.has(remainder)) {
                  sectionMap.set(remainder, { name: name, pinCount: pinCount });
                }
              }
            }
          }
        }
      }
    });
    sectionMap.forEach(function(data, slug) {
      boardSections.push({
        name: data.name,
        slug: slug,
        url: boardPath + '/' + slug,
        pinCount: data.pinCount
      });
    });
    boardSections.sort(function(a, b) { return a.name.localeCompare(b.name); });
    return boardSections;
  }

  async function detectSectionsAsync() {
    detectSections();
    var originalScroll = window.scrollY;
    for (var pos = 0; pos <= 2500; pos += 400) {
      window.scrollTo(0, pos);
      await sleep(300);
    }
    await sleep(800);
    window.scrollTo(0, originalScroll);
    await sleep(300);
    detectSections();
    return boardSections;
  }

  function esc(x) {
    var d = document.createElement('div');
    d.textContent = x;
    return d.innerHTML;
  }

  async function createUI() {
    var info = getBoardInfo();
    safeName = boardName.replace(/[^a-zA-Z0-9]/g, '_');
    var overlay = document.createElement('div');
    overlay.id = 'pa-overlay';
    var html = '<div class="pa-h"><h2>Pinterest Archiver</h2><button class="pa-x" id="pa-x">×</button></div>';
    html += '<div class="pa-c"><div class="pa-i"><div class="pa-n">' + esc(info.n) + '</div>';
    if (info.section) {
      html += '<div class="pa-p" style="color:#e60023">Section: ' + esc(info.section) + '</div>';
    }
    html += '<div class="pa-p">' + info.t.toLocaleString() + ' pins</div></div>';
    html += '<div id="pa-sections-panel">';
    if (!info.section) {
      html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
      html += '<div style="font-weight:600;font-size:13px;margin-bottom:8px">Sections</div>';
      html += '<div style="color:#888;font-size:12px;padding:8px 0;text-align:center">';
      html += '<div style="display:inline-block;width:16px;height:16px;border:2px solid #ddd;border-top-color:#e60023;border-radius:50%;animation:pa-spin 1s linear infinite;margin-right:8px;vertical-align:middle"></div>';
      html += 'Loading sections...</div></div>';
    }
    html += '</div>';
    html += '<div id="pa-btns">';
    html += '<div class="pa-t">Download Controls</div>';

    // Play/Pause buttons
    html += '<div class="pa-r" style="margin-bottom:12px">';
    html += '<button class="pa-b pa-bg" id="pa-play">▶ Play</button>';
    html += '<button class="pa-b pa-by" id="pa-pause" disabled>⏸ Pause & Save</button>';
    html += '</div>';

    // Live status
    html += '<div id="pa-live-status" style="display:none;margin-bottom:12px;padding:10px;background:#f0fff0;border:1px solid #28a745;border-radius:8px">';
    html += '<div style="font-size:13px"><span class="pa-live"></span><span id="pa-live-text">Downloading...</span></div>';
    html += '<div style="font-size:12px;color:#666;margin-top:4px">';
    html += '<span id="pa-stat-downloaded">0</span> downloaded · ';
    html += '<span id="pa-stat-queue">0</span> queued · ';
    html += '<span id="pa-stat-active">0</span> active</div>';
    html += '</div>';

    // Progress bar
    html += '<div style="margin-bottom:12px">';
    html += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">';
    html += '<span id="pa-dl-count">0 downloaded</span>';
    html += '<span>' + info.t + ' total</span>';
    html += '</div>';
    html += '<div style="height:12px;background:#e0e0e0;border-radius:6px;overflow:hidden">';
    html += '<div id="pa-dl-bar" style="height:100%;background:linear-gradient(90deg,#28a745,#20c997);width:0%;transition:width 0.3s"></div>';
    html += '</div></div>';

    html += '</div><div class="pa-s" id="pa-s"><span id="pa-st">Ready</span>';
    html += '<div class="pa-g"><div class="pa-gb" id="pa-gb"></div></div></div>';
    html += '<div class="pa-m" id="pa-m"></div>';
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;font-size:13px;color:#666">Author: <a href="https://www.jbrandford.com" target="_blank" style="color:#e60023;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" style="vertical-align:-2px;margin-right:4px"><circle cx="7" cy="7" r="7" fill="#e60023"/></svg>J.Brandford</a></div></div>';
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('pa-x').onclick = function() {
      scrollAbort = true;
      isPaused = true;
      overlay.remove();
    };

    document.getElementById('pa-play').onclick = function() {
      if (!isPlaying) startStreamingDownload();
    };

    document.getElementById('pa-pause').onclick = function() {
      if (isPlaying) pauseAndSave();
    };

    function updateSectionsPanel(sections) {
      var panel = document.getElementById('pa-sections-panel');
      if (!panel) return;
      if (info.section) { panel.innerHTML = ''; return; }
      var sectionPinTotal = sections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
      var mainPinCount = Math.max(0, info.t - sectionPinTotal);
      var html = '';
      if (sections.length > 0) {
        html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
        html += '<label style="display:flex;align-items:center;cursor:pointer;font-weight:600;font-size:13px">';
        html += '<input type="checkbox" id="pa-select-all-sections" checked style="margin-right:6px">';
        html += '<span>Sections (' + sectionPinTotal + ' pins)</span></label>';
        html += '<button id="pa-scan-sections" style="font-size:11px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer">Scan Again</button>';
        html += '</div>';
        html += '<div style="max-height:180px;overflow-y:auto;border:1px solid #e0e0e0;border-radius:4px;background:#fff">';
        sections.forEach(function(sec, idx) {
          html += '<label style="display:flex;align-items:center;padding:6px 8px;border-bottom:1px solid #f0f0f0;cursor:pointer;font-size:12px">';
          html += '<input type="checkbox" class="pa-section-cb" data-idx="' + idx + '" checked style="margin-right:8px">';
          html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sec.name) + '</span>';
          if (sec.pinCount > 0) html += '<span style="color:#888;font-size:11px;margin-left:8px">' + sec.pinCount + ' pins</span>';
          html += '</label>';
        });
        html += '</div></div>';
      } else {
        html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<span style="font-weight:600;font-size:13px;color:#888">No sections found</span>';
        html += '<button id="pa-scan-sections" style="font-size:11px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer">Scan Again</button>';
        html += '</div></div>';
      }
      html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
      html += '<label style="display:flex;align-items:center;cursor:pointer;font-weight:600;font-size:13px">';
      html += '<input type="checkbox" class="pa-section-cb" data-main="true" checked style="margin-right:6px">';
      html += '<span>Main board (' + mainPinCount + ' pins)</span></label></div>';
      panel.innerHTML = html;
      var scanBtn = document.getElementById('pa-scan-sections');
      if (scanBtn) {
        scanBtn.onclick = async function() {
          scanBtn.disabled = true;
          scanBtn.textContent = 'Scanning...';
          await detectSectionsAsync();
          updateSectionsPanel(boardSections);
        };
      }
      var selectAllCb = document.getElementById('pa-select-all-sections');
      if (selectAllCb) {
        selectAllCb.onchange = function() {
          document.querySelectorAll('.pa-section-cb[data-idx]').forEach(function(cb) { cb.checked = selectAllCb.checked; });
        };
      }
    }
    if (!info.section) {
      var sections = await detectSectionsAsync();
      updateSectionsPanel(sections);
    }
  }

  function stat(text, progress) {
    var se = document.getElementById('pa-s');
    var st = document.getElementById('pa-st');
    var gb = document.getElementById('pa-gb');
    if (se) se.classList.add('on');
    if (st) st.textContent = text;
    if (gb && progress != null) gb.style.width = (progress * 100) + '%';
  }

  function msg(text) {
    var m = document.getElementById('pa-m');
    if (m) { m.classList.add('on'); m.innerHTML = text; }
  }

  function updateLiveStats() {
    var dlEl = document.getElementById('pa-stat-downloaded');
    var qEl = document.getElementById('pa-stat-queue');
    var aEl = document.getElementById('pa-stat-active');
    var countEl = document.getElementById('pa-dl-count');
    var barEl = document.getElementById('pa-dl-bar');

    if (dlEl) dlEl.textContent = downloadedFiles.length;
    if (qEl) qEl.textContent = pinQueue.length;
    if (aEl) aEl.textContent = activeDownloads;
    if (countEl) countEl.textContent = downloadedFiles.length + ' downloaded';
    if (barEl && totalPins > 0) {
      barEl.style.width = Math.min(100, (downloadedFiles.length / totalPins) * 100) + '%';
    }
  }

  function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

  function getOriginalUrl(url) {
    if (!url || url.indexOf('pinimg.com') === -1) return null;
    url = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    return url.replace(/\/\d+x\d*\//, '/originals/');
  }

  function isValidPinImage(url) {
    if (!url || url.indexOf('pinimg.com') === -1) return false;
    if (url.indexOf('/avatars/') !== -1) return false;
    if (/\/(75x75|60x60|50x50|30x30|140x140)(_RS)?\//.test(url)) return false;
    return true;
  }

  // ========== HYBRID FILTERING ==========
  // 1. Primary: Hard cap based on expected pin count (with buffer)
  // 2. Secondary: Detect when we enter "More ideas" / recommendation section
  var expectedPinCount = 0;
  var pinCountBuffer = 1.15; // Allow 15% buffer for Pinterest count inaccuracy
  var reachedRecommendations = false;

  function isInRecommendationSection(element) {
    // Check if this pin is after a "More ideas" heading or in a different section
    // Walk up to find if there's a section divider before this element
    var current = element;
    var stepsUp = 0;
    while (current && stepsUp < 10) {
      // Check previous siblings for recommendation markers
      var prev = current.previousElementSibling;
      while (prev) {
        var text = prev.textContent || '';
        // Look for "More ideas", "More to explore", "Picked for you" etc
        if (/more ideas|more to explore|picked for you|inspired by|you might like/i.test(text)) {
          console.log('[PA] Found recommendation marker: ' + text.substring(0, 50));
          return true;
        }
        // Also check for h1/h2/h3 headings that might indicate a new section
        var heading = prev.querySelector('h1, h2, h3');
        if (heading) {
          var headingText = heading.textContent || '';
          if (/more ideas|explore|for you|inspired/i.test(headingText)) {
            console.log('[PA] Found recommendation heading: ' + headingText);
            return true;
          }
        }
        prev = prev.previousElementSibling;
      }
      current = current.parentElement;
      stepsUp++;
    }
    return false;
  }
  // ========== END HYBRID FILTERING ==========

  async function fetchImage(url) {
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error();
      return await r.arrayBuffer();
    } catch (e) {
      try {
        var r2 = await fetch(url.replace('/originals/', '/736x/'));
        if (!r2.ok) throw new Error();
        return await r2.arrayBuffer();
      } catch (e2) { return null; }
    }
  }

  // Scan DOM for new pins and add to queue
  // CRITICAL: Claim pin IDs immediately in downloadedPinIds to prevent duplicates with parallel workers
  // HYBRID FILTERING: Hard cap + recommendation section detection
  var skippedRecs = 0;
  function scanForNewPins() {
    var found = 0;

    // PRIMARY CHECK: Have we collected enough pins?
    var maxPins = Math.ceil(expectedPinCount * pinCountBuffer);
    var currentCount = downloadedPinIds.size;
    if (expectedPinCount > 0 && currentCount >= maxPins) {
      console.log('[PA] Reached pin cap: ' + currentCount + '/' + maxPins);
      return 0; // Stop collecting
    }

    var pinElements = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');

    pinElements.forEach(function(container) {
      if (container.dataset.paQueued || container.dataset.paDownloaded || container.dataset.paSkipped) return;
      if (container.closest('header, nav')) return;

      // Check cap again inside loop
      if (expectedPinCount > 0 && downloadedPinIds.size >= maxPins) return;

      // SECONDARY CHECK: Are we in recommendations section?
      if (!reachedRecommendations && downloadedPinIds.size >= expectedPinCount * 0.9) {
        // Once we're close to expected count, start checking for recommendation markers
        if (isInRecommendationSection(container)) {
          reachedRecommendations = true;
          console.log('[PA] Entered recommendations section at ' + downloadedPinIds.size + ' pins');
        }
      }
      if (reachedRecommendations) {
        container.dataset.paSkipped = 'recommendation';
        skippedRecs++;
        return;
      }

      var link = container.querySelector('a[href*="/pin/"]');
      if (!link) return;
      var match = link.href.match(/\/pin\/(\d+)/);
      if (!match) return;
      var pinId = match[1];
      if (downloadedPinIds.has(pinId)) return;

      // Find image - try multiple sources
      var imgUrl = null;
      var img = container.querySelector('img');
      if (img) {
        if (img.src && img.src.indexOf('pinimg.com') !== -1) imgUrl = img.src;
        else if (img.srcset && img.srcset.indexOf('pinimg.com') !== -1) imgUrl = img.srcset.split(' ')[0];
      }
      if (!imgUrl) {
        var video = container.querySelector('video[poster]');
        if (video && video.poster && video.poster.indexOf('pinimg.com') !== -1) imgUrl = video.poster;
      }

      if (imgUrl && isValidPinImage(imgUrl)) {
        downloadedPinIds.add(pinId);
        container.dataset.paQueued = 'true';
        fileCounter++;
        pinQueue.push({ pinId: pinId, url: getOriginalUrl(imgUrl), element: container, fileNum: fileCounter });
        found++;
      }
    });

    // NOTE: Script tag scanning removed - we rely on DOM elements within board container
    // JSON pins can't be verified for container membership
    return found;
  }

  // Download in synchronized batches - preserves order because Promise.all returns in input order
  var isScrolling = false;

  async function downloadBatches() {
    while (isPlaying && !isPaused) {
      // Wait for pins to be available
      if (pinQueue.length === 0) {
        if (!isScrolling) break; // Done scrolling and queue empty
        await sleep(50);
        continue;
      }

      // Grab a batch (up to MAX_PARALLEL)
      var batch = pinQueue.splice(0, MAX_PARALLEL);
      activeDownloads = batch.length;
      updateLiveStats();

      // Download all in parallel - Promise.all preserves order!
      var results = await Promise.all(batch.map(async function(item) {
        var data = await fetchImage(item.url);
        return { item: item, data: data };
      }));

      // Add results IN ORDER (Promise.all guarantees order matches input)
      results.forEach(function(r) {
        if (r.data) {
          downloadedFiles.push({
            name: safeName + '/' + String(r.item.fileNum).padStart(5, '0') + '.jpg',
            data: r.data,
            crc: crc32(new Uint8Array(r.data))
          });
        }
        // Mark element as downloaded
        if (r.item.element) {
          r.item.element.dataset.paDownloaded = 'true';
          r.item.element.style.opacity = '0.3';
        }
      });

      activeDownloads = 0;
      updateLiveStats();
    }
  }

  // Scroll loop - continuously scrolls to load more pins
  // Uses HYBRID FILTERING: hard cap + recommendation detection
  async function scrollLoop() {
    var noNewPinsCount = 0;
    var lastTotalPins = pinQueue.length + downloadedFiles.length;
    var maxPins = Math.ceil(expectedPinCount * pinCountBuffer);

    // CRITICAL: Scan pins at current position FIRST before any scrolling
    scanForNewPins();
    updateLiveStats();
    await sleep(150);

    while (isPlaying && !isPaused && !scrollAbort) {
      // Stop if we hit the cap or reached recommendations
      if (reachedRecommendations || (expectedPinCount > 0 && downloadedPinIds.size >= maxPins)) {
        stat('Reached pin limit: ' + downloadedPinIds.size + '/' + expectedPinCount, 1);
        console.log('[PA] Stopping: reached pin limit or recommendations');
        break;
      }

      window.scrollBy(0, window.innerHeight * 1.5);
      await sleep(150);

      var found = scanForNewPins();
      updateLiveStats();

      var currentTotal = pinQueue.length + downloadedFiles.length;
      if (currentTotal === lastTotalPins && found === 0) {
        noNewPinsCount++;
        if (noNewPinsCount > 20) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(500);
          scanForNewPins();
          var afterAggressiveTotal = pinQueue.length + downloadedFiles.length;
          if (afterAggressiveTotal === lastTotalPins) {
            stat('All board pins found: ' + downloadedFiles.length, 1);
            console.log('[PA] Scroll complete: ' + downloadedFiles.length + ' board pins');
            break;
          }
          noNewPinsCount = 0;
          lastTotalPins = afterAggressiveTotal;
        }
      } else {
        noNewPinsCount = 0;
        lastTotalPins = currentTotal;
      }

      var liveText = document.getElementById('pa-live-text');
      if (liveText) {
        liveText.textContent = 'Downloading... ' + downloadedFiles.length + '/' + expectedPinCount;
      }
    }
  }

  // Start streaming download
  async function startStreamingDownload() {
    if (isPlaying) return;

    isPlaying = true;
    isPaused = false;
    scrollAbort = false;

    // Update UI
    document.getElementById('pa-play').disabled = true;
    document.getElementById('pa-pause').disabled = false;
    document.getElementById('pa-live-status').style.display = 'block';
    stat('Starting...', 0);

    // Get selected sections from checkboxes
    var selectedSections = [];
    var downloadMainBoard = true;
    document.querySelectorAll('.pa-section-cb').forEach(function(cb) {
      if (cb.dataset.main === 'true') {
        downloadMainBoard = cb.checked;
      } else if (cb.checked && cb.dataset.idx) {
        var idx = parseInt(cb.dataset.idx, 10);
        if (boardSections[idx]) selectedSections.push(boardSections[idx]);
      }
    });

    console.log('[PA] Using BOARD ID VERIFICATION to filter recommendations');

    // SECTIONS FIRST (Rule 2 from CLAUDE.md)
    if (selectedSections.length > 0) {
      for (var i = 0; i < selectedSections.length && !isPaused; i++) {
        var section = selectedSections[i];
        var sectionUrl = 'https://www.pinterest.com' + section.url;
        stat('Downloading section ' + (i + 1) + '/' + selectedSections.length + ': ' + section.name, i / selectedSections.length);

        var result = await collectFromSectionIframe(sectionUrl, section.name, section.pinCount);

        // Download section images and add to files with section subfolder
        var sectionFolder = safeName + '/' + section.name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        var sectionCounter = 0;

        for (var j = 0; j < result.urls.length && !isPaused; j++) {
          var item = result.urls[j];
          if (downloadedPinIds.has(item.pinId)) continue; // Already claimed (from another section)
          downloadedPinIds.add(item.pinId); // CLAIM IMMEDIATELY before fetch

          var data = await fetchImage(item.url);
          if (data) {
            sectionCounter++;
            downloadedFiles.push({
              name: sectionFolder + '/' + String(sectionCounter).padStart(5, '0') + '.jpg',
              data: data,
              crc: crc32(new Uint8Array(data))
            });
          }
          updateLiveStats();
        }

        var liveText = document.getElementById('pa-live-text');
        if (liveText) liveText.textContent = 'Section "' + section.name + '": ' + sectionCounter + ' saved';
      }
    }

    // Download main board if selected (after sections)
    if (downloadMainBoard && !isPaused) {
      stat('Downloading main board...', 0);

      // Calculate expected main board pins (total minus section pins)
      var sectionPinTotal = boardSections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
      expectedPinCount = Math.max(0, totalPins - sectionPinTotal);
      reachedRecommendations = false;
      skippedRecs = 0;

      console.log('[PA] Main board: expecting ~' + expectedPinCount + ' pins (total: ' + totalPins + ', sections: ' + sectionPinTotal + ')');
      console.log('[PA] Will cap at ' + Math.ceil(expectedPinCount * pinCountBuffer) + ' pins (with ' + Math.round((pinCountBuffer - 1) * 100) + '% buffer)');

      // Start from top of page
      window.scrollTo(0, 0);
      await sleep(500);

      // Start scroll loop and batch downloader in parallel
      isScrolling = true;
      var scrollPromise = scrollLoop().then(function() { isScrolling = false; });
      var downloadPromise = downloadBatches();

      // Wait for both to complete
      await scrollPromise;
      await downloadPromise;

      // FINAL SWEEP: Multiple passes to catch ALL lazy-loaded board pins
      // Pinterest lazy-loads images - need to scroll multiple times to trigger all loading
      // Hybrid filtering ensures we stop at expected count or when hitting recommendations
      stat('Final sweep for missed pins...', 0.95);

      var maxPins = Math.ceil(expectedPinCount * pinCountBuffer);
      for (var pass = 0; pass < 3 && !isPaused; pass++) {
        // Stop if we've reached the cap or recommendations
        if (reachedRecommendations || (expectedPinCount > 0 && downloadedPinIds.size >= maxPins)) {
          console.log('[PA] Final sweep: already at limit, skipping pass ' + (pass + 1));
          break;
        }

        // Scroll to very bottom first to trigger all lazy loading
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(800);

        // Now scroll back to top
        window.scrollTo(0, 0);
        await sleep(800);

        var foundInPass = 0;
        var pageHeight = document.body.scrollHeight;
        var scrollStep = window.innerHeight * 0.8;
        var scrollPos = 0;

        // Scroll through entire page slowly to catch everything
        while (scrollPos < pageHeight && !isPaused && !reachedRecommendations) {
          // Stop if we hit the cap
          if (expectedPinCount > 0 && downloadedPinIds.size >= maxPins) break;

          window.scrollTo(0, scrollPos);
          await sleep(400); // Longer wait for images to load

          var found = scanForNewPins();
          foundInPass += found;

          // Download any queued pins immediately
          while (pinQueue.length > 0 && !isPaused) {
            var batch = pinQueue.splice(0, MAX_PARALLEL);
            var results = await Promise.all(batch.map(async function(item) {
              var data = await fetchImage(item.url);
              return { item: item, data: data };
            }));
            results.forEach(function(r) {
              if (r.data) {
                downloadedFiles.push({
                  name: safeName + '/' + String(r.item.fileNum).padStart(5, '0') + '.jpg',
                  data: r.data,
                  crc: crc32(new Uint8Array(r.data))
                });
              }
            });
            updateLiveStats();
          }

          scrollPos += scrollStep;
        }

        stat('Pass ' + (pass + 1) + '/3: found ' + foundInPass + ' more board pins (skipped ' + skippedRecs + ' recs)', 0.95 + (pass * 0.015));

        // If we didn't find any new board pins in this pass, we're done
        if (foundInPass === 0) break;
      }

      stat('Finishing downloads...', 0.99);
    }

    // Auto-save if not paused manually
    if (!isPaused) {
      await saveZip();
    }
  }

  // Pause and save current progress
  async function pauseAndSave() {
    isPaused = true;
    scrollAbort = true;

    var liveStatus = document.getElementById('pa-live-status');
    var liveIndicator = liveStatus?.querySelector('.pa-live');
    if (liveIndicator) liveIndicator.classList.add('pa-paused');

    var liveText = document.getElementById('pa-live-text');
    if (liveText) liveText.textContent = 'Pausing...';

    stat('Finishing current downloads...', 0.9);

    // Wait for active downloads to complete
    while (activeDownloads > 0) {
      await sleep(100);
      updateLiveStats();
    }

    await saveZip();

    // Reset state for potential resume
    isPlaying = false;
    document.getElementById('pa-play').disabled = false;
    document.getElementById('pa-play').textContent = '▶ Resume';
    document.getElementById('pa-pause').disabled = true;

    if (liveIndicator) liveIndicator.classList.remove('pa-paused');
  }

  // Save collected files to zip
  async function saveZip() {
    if (downloadedFiles.length === 0) {
      stat('No pins to save', 0);
      msg('<b>No pins collected.</b> Try scrolling the page first.');
      return;
    }

    stat('Creating zip with ' + downloadedFiles.length + ' images...', 1);
    await sleep(100);

    // Sort files by name to ensure correct order in ZIP
    downloadedFiles.sort(function(a, b) { return a.name.localeCompare(b.name); });

    var zipData = createZip(downloadedFiles);
    var blob = new Blob([zipData], { type: 'application/zip' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = safeName + '_pins_' + downloadedFiles.length + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    stat('Saved! ' + downloadedFiles.length + ' images', 1);
    msg('<b>Saved!</b> ' + downloadedFiles.length + ' images downloaded.');

    document.getElementById('pa-live-status').style.display = 'none';
  }

  // Section download via iframe (kept for sections support)
  // Uses HYBRID FILTERING: hard cap + recommendation detection
  async function collectFromSectionIframe(sectionUrl, sectionName, sectionExpectedCount) {
    return new Promise(async function(resolve) {
      stat('Loading "' + sectionName + '"...', 0);
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0;pointer-events:none;z-index:-1';
      iframe.src = sectionUrl;
      document.body.appendChild(iframe);
      var loaded = false;
      iframe.onload = function() { loaded = true; };
      for (var w = 0; w < 20 && !loaded; w++) await sleep(500);
      if (!loaded) { iframe.remove(); resolve({ urls: [], pinIds: new Set() }); return; }
      await sleep(2000); // Wait for React hydration
      var iframeDoc;
      try { iframeDoc = iframe.contentDocument || iframe.contentWindow.document; }
      catch (e) { iframe.remove(); resolve({ urls: [], pinIds: new Set() }); return; }

      var pinData = new Map(), iframeWin = iframe.contentWindow;
      var target = sectionExpectedCount || 50;
      var maxTarget = Math.ceil(target * pinCountBuffer);
      var sectionReachedRecs = false;
      var skippedRecs = 0;
      stat('Scanning "' + sectionName + '" (expecting ~' + target + ')...', 0);

      function collect() {
        // Stop if we hit the cap
        if (pinData.size >= maxTarget) return;

        iframeDoc.querySelectorAll('a[href*="/pin/"]').forEach(function(link) {
          if (pinData.size >= maxTarget) return;

          var m = link.href.match(/\/pin\/(\d+)/);
          if (!m || pinData.has(m[1])) return;

          var pinId = m[1];

          var c = link.closest('[data-test-id="pin"]') || link.closest('[data-grid-item="true"]');
          if (!c) c = link.parentElement && link.parentElement.parentElement && link.parentElement.parentElement.parentElement;
          if (!c) return;

          // Check for recommendation section once we're close to expected count
          if (!sectionReachedRecs && pinData.size >= target * 0.9) {
            if (isInRecommendationSection(c)) {
              sectionReachedRecs = true;
              console.log('[PA] Section "' + sectionName + '" reached recs at ' + pinData.size);
            }
          }
          if (sectionReachedRecs) {
            skippedRecs++;
            return;
          }

          // Find image - try multiple sources
          var imgUrl = null;
          var img = c.querySelector('img');
          if (img) {
            if (img.src && img.src.indexOf('pinimg.com') !== -1) imgUrl = img.src;
            else if (img.srcset && img.srcset.indexOf('pinimg.com') !== -1) imgUrl = img.srcset.split(' ')[0];
          }
          if (!imgUrl) {
            var video = c.querySelector('video[poster]');
            if (video && video.poster && video.poster.indexOf('pinimg.com') !== -1) imgUrl = video.poster;
          }

          if (imgUrl && isValidPinImage(imgUrl)) pinData.set(pinId, getOriginalUrl(imgUrl));
        });
      }

      collect();
      var lastCt = 0, sameCt = 0;
      for (var s = 0; s < 150; s++) {
        // Stop if we hit the cap or recommendations
        if (pinData.size >= maxTarget || sectionReachedRecs) break;

        iframeWin.scrollBy(0, iframeWin.innerHeight * 2);
        await sleep(300);
        collect();
        var ct = pinData.size;
        stat('"' + sectionName + '": ' + ct + '/' + target, ct / target);
        if (ct >= target) break;
        if (ct === lastCt) { sameCt++; if (sameCt > 15) break; } else { sameCt = 0; lastCt = ct; }
      }

      console.log('[PA] Section "' + sectionName + '" complete: ' + pinData.size + ' pins' + (skippedRecs > 0 ? ', skipped ' + skippedRecs + ' recs' : ''));

      var urls = [], pinIds = new Set();
      pinData.forEach(function(url, id) { if (url) { urls.push({ url: url, pinId: id }); pinIds.add(id); } });
      iframe.remove();
      resolve({ urls: urls, pinIds: pinIds });
    });
  }

  createUI();
})(); // LATEST VERSION - v10.0 HYBRID FILTERING: Pin count cap + recommendation section detection
