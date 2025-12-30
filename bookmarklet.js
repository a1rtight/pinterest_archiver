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
  function scanForNewPins() {
    var found = 0;
    var pinElements = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');

    pinElements.forEach(function(container) {
      if (container.dataset.paQueued || container.dataset.paDownloaded) return;
      if (container.closest('header, nav')) return;

      var link = container.querySelector('a[href*="/pin/"]');
      if (!link) return;
      var match = link.href.match(/\/pin\/(\d+)/);
      if (!match) return;
      var pinId = match[1];
      if (downloadedPinIds.has(pinId)) return;

      var img = container.querySelector('img[src*="pinimg.com"]');
      if (img && isValidPinImage(img.src)) {
        container.dataset.paQueued = 'true';
        pinQueue.push({ pinId: pinId, url: getOriginalUrl(img.src), element: container });
        found++;
      }
    });

    // Also scan script tags
    document.querySelectorAll('script:not([src]):not([data-pa-scanned])').forEach(function(script) {
      var text = script.textContent || '';
      if (text.length < 100 || text.indexOf('pinimg.com') === -1) return;
      script.dataset.paScanned = 'true';

      var pattern = /"id"\s*:\s*"(\d+)"[^}]*?"images"[^}]*?"orig"[^}]*?"url"\s*:\s*"([^"]+pinimg[^"]+)"/g;
      var m;
      while ((m = pattern.exec(text)) !== null) {
        if (!downloadedPinIds.has(m[1]) && !pinQueue.some(function(p) { return p.pinId === m[1]; })) {
          var url = m[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          if (isValidPinImage(url)) {
            pinQueue.push({ pinId: m[1], url: getOriginalUrl(url), element: null });
            found++;
          }
        }
      }
    });

    return found;
  }

  // Download worker - processes items from queue
  async function downloadWorker() {
    while (isPlaying && !isPaused) {
      if (pinQueue.length === 0) {
        await sleep(50);
        continue;
      }

      var item = pinQueue.shift();
      if (!item || downloadedPinIds.has(item.pinId)) continue;

      activeDownloads++;
      updateLiveStats();

      try {
        var data = await fetchImage(item.url);
        if (data) {
          fileCounter++;
          downloadedFiles.push({
            name: safeName + '/' + String(fileCounter).padStart(5, '0') + '.jpg',
            data: data,
            crc: crc32(new Uint8Array(data))
          });
          downloadedPinIds.add(item.pinId);

          // Remove from DOM to free memory
          if (item.element && item.element.parentNode) {
            item.element.dataset.paDownloaded = 'true';
            item.element.remove();
          }
        }
      } catch (e) {}

      activeDownloads--;
      updateLiveStats();
    }
  }

  // Scroll loop - continuously scrolls to load more pins
  async function scrollLoop() {
    var noNewPinsCount = 0;
    var lastQueueSize = 0;

    while (isPlaying && !isPaused && !scrollAbort) {
      // Scroll down
      window.scrollBy(0, window.innerHeight * 1.5);
      await sleep(150);

      // Scan for new pins
      var found = scanForNewPins();
      updateLiveStats();

      // Check if we're finding new pins
      if (pinQueue.length === lastQueueSize && found === 0) {
        noNewPinsCount++;
        if (noNewPinsCount > 20) {
          // Try more aggressive scroll
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(500);
          scanForNewPins();
          if (pinQueue.length === lastQueueSize) {
            // Still no new pins, check if we've reached the end
            stat('Reached end of board', 1);
            break;
          }
          noNewPinsCount = 0;
        }
      } else {
        noNewPinsCount = 0;
        lastQueueSize = pinQueue.length + downloadedFiles.length;
      }

      var liveText = document.getElementById('pa-live-text');
      if (liveText) {
        liveText.textContent = 'Downloading... ' + downloadedFiles.length + ' saved';
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

    // Start download workers (parallel)
    var workers = [];
    for (var i = 0; i < MAX_PARALLEL; i++) {
      workers.push(downloadWorker());
    }

    // Start scroll loop
    var scrollPromise = scrollLoop();

    // Wait for scroll to finish
    await scrollPromise;

    // Wait for queue to drain
    stat('Finishing downloads...', 0.9);
    while (pinQueue.length > 0 || activeDownloads > 0) {
      await sleep(100);
      updateLiveStats();
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
  async function collectFromSectionIframe(sectionUrl, sectionName, expectedPinCount) {
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
      await sleep(2000);
      var iframeDoc;
      try { iframeDoc = iframe.contentDocument || iframe.contentWindow.document; }
      catch (e) { iframe.remove(); resolve({ urls: [], pinIds: new Set() }); return; }
      var pinData = new Map(), iframeWin = iframe.contentWindow, target = expectedPinCount || 50;
      stat('Scanning "' + sectionName + '"...', 0);

      function collect() {
        iframeDoc.querySelectorAll('a[href*="/pin/"]').forEach(function(link) {
          var m = link.href.match(/\/pin\/(\d+)/);
          if (!m || pinData.has(m[1])) return;
          var c = link.closest('[data-test-id="pin"]') || link.closest('[data-grid-item="true"]') || link.parentElement?.parentElement?.parentElement;
          if (!c) return;
          var img = c.querySelector('img[src*="pinimg.com"]');
          if (img && isValidPinImage(img.src)) pinData.set(m[1], getOriginalUrl(img.src));
        });
        iframeDoc.querySelectorAll('script').forEach(function(script) {
          var text = script.textContent || '';
          if (text.length < 100 || text.indexOf('pinimg.com') === -1) return;
          var pattern = /"id"\s*:\s*"(\d+)"[^}]*?"images"[^}]*?"orig"[^}]*?"url"\s*:\s*"([^"]+pinimg[^"]+)"/g;
          var match;
          while ((match = pattern.exec(text)) !== null) {
            if (!pinData.has(match[1])) {
              var url = match[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
              if (isValidPinImage(url)) pinData.set(match[1], getOriginalUrl(url));
            }
          }
        });
      }

      collect();
      var lastCt = 0, sameCt = 0;
      for (var s = 0; s < 150; s++) {
        iframeWin.scrollBy(0, iframeWin.innerHeight * 2);
        await sleep(300);
        collect();
        var ct = pinData.size;
        stat('"' + sectionName + '": ' + ct + '/' + target, ct / target);
        if (ct >= target) break;
        if (ct === lastCt) { sameCt++; if (sameCt > 15) break; } else { sameCt = 0; lastCt = ct; }
      }
      var urls = [], pinIds = new Set();
      pinData.forEach(function(url, id) { if (url) { urls.push({ url: url, pinId: id }); pinIds.add(id); } });
      iframe.remove();
      resolve({ urls: urls, pinIds: pinIds });
    });
  }

  createUI();
})(); // LATEST v7 - streaming play/pause with parallel downloads
