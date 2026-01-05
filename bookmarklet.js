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

  // URL watching for dynamic UI updates
  var currentUrl = location.href;
  var urlWatchInterval = null;

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

  // Extract section pin count from BoardSectionResource JSON
  // This is the authoritative source for section pages
  // IMPORTANT: Must verify the JSON matches current URL (client-side nav keeps old script tags)
  // If stale, fetches fresh HTML from server
  async function getSectionPinCount() {
    // Parse current URL to get expected slugs
    var pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length < 3) return null; // Not a section URL

    var urlUsername = pathParts[0];
    var urlBoardSlug = pathParts[1];
    var urlSectionSlug = pathParts[2];

    // Skip system routes - these aren't sections
    var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize'];
    if (systemRoutes.indexOf(urlSectionSlug) !== -1) return null;

    // Helper to extract pin count from HTML (document or string)
    function extractFromScripts(scripts, username, boardSlug, sectionSlug) {
      for (var i = 0; i < scripts.length; i++) {
        try {
          var scriptContent = scripts[i].textContent || scripts[i];
          var json = JSON.parse(scriptContent);
          if (json.resource && json.resource.name === 'BoardSectionResource') {
            var opts = json.resource.options || {};
            if (opts.username === username &&
                opts.board_slug === boardSlug &&
                opts.section_slug === sectionSlug) {
              var data = json.resource_response && json.resource_response.data;
              if (data && data.type === 'board_section' && typeof data.pin_count === 'number') {
                return data.pin_count;
              }
            }
          }
        } catch (e) { /* ignore parse errors */ }
      }
      return null;
    }

    // Try current DOM first
    var scripts = document.querySelectorAll('script[data-test-id="resource-response-data"]');
    var count = extractFromScripts(scripts, urlUsername, urlBoardSlug, urlSectionSlug);
    if (count !== null) {
      console.log('[PA] Found section pin count from DOM: ' + count);
      return count;
    }

    // DOM data is stale - fetch fresh HTML
    console.log('[PA] DOM data stale, fetching fresh page data...');
    try {
      var response = await fetch(location.href);
      var html = await response.text();

      // Parse the HTML to extract script contents
      var scriptMatches = html.match(/<script[^>]*data-test-id="resource-response-data"[^>]*>([^<]+)<\/script>/g);
      if (scriptMatches) {
        var scriptContents = scriptMatches.map(function(s) {
          var match = s.match(/>([^<]+)</);
          return match ? match[1] : '';
        });
        count = extractFromScripts(scriptContents, urlUsername, urlBoardSlug, urlSectionSlug);
        if (count !== null) {
          console.log('[PA] Found section pin count from fetched HTML: ' + count);
          return count;
        }
      }
    } catch (e) {
      console.log('[PA] Failed to fetch fresh page data:', e);
    }

    return null;
  }

  async function getBoardInfo() {
    var selectors = ['[data-test-id="board-name"]', 'h1', '[role="heading"]'];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim()) {
        boardName = el.textContent.trim();
        break;
      }
    }

    // Try section pin count first (from BoardSectionResource JSON)
    var sectionPinCount = await getSectionPinCount();
    if (sectionPinCount !== null) {
      totalPins = sectionPinCount;
    } else {
      // Fall back to DOM-based detection for main board
      var pc = document.querySelector('[data-test-id="pin-count"]');
      if (pc) {
        var m = pc.textContent.match(/[\d,]+/);
        if (m) totalPins = parseInt(m[0].replace(/,/g, ''), 10);
      }
      if (!totalPins) totalPins = document.querySelectorAll('[data-test-id="pin"]').length || 0;
    }
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

    // System routes that are NOT user sections
    var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize', 'organise', 'collaborators', 'invites', 'see', 'see-pins', 'see_pins', 'ideas', 'search', 'notifications', 'messages', 'create', 'board', 'pin', 'user', 'about', 'terms', 'privacy', 'help', 'contact'];

    // Check if a slug is a valid user section (not a system route or hidden)
    function isValidSection(slug) {
      if (!slug) return false;
      if (systemRoutes.indexOf(slug.toLowerCase()) !== -1) return false;
      if (slug.charAt(0) === '_') return false; // Hidden/system sections like _tools
      if (slug.match(/^[\d]+$/)) return false; // Pure numbers (unlikely to be sections)
      return true;
    }

    // Strategy 1: Parse JSON from script tags
    try {
      var scripts = document.querySelectorAll('script');
      scripts.forEach(function(script) {
        var text = script.textContent || '';
        if (text.length < 100) return;
        var sectionPattern = /"slug"\s*:\s*"([^"]+)"[^}]*?"__typename"\s*:\s*"BoardSection"/g;
        var match;
        while ((match = sectionPattern.exec(text)) !== null) {
          var slug = match[1];
          if (!isValidSection(slug)) continue;
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
            console.log('[PA] Found section from JSON: "' + name + '" (' + pinCount + ' pins)');
          }
        }
        var reversePattern = /"__typename"\s*:\s*"BoardSection"[^}]*?"slug"\s*:\s*"([^"]+)"/g;
        while ((match = reversePattern.exec(text)) !== null) {
          var slug = match[1];
          if (!isValidSection(slug)) continue;
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
            console.log('[PA] Found section from JSON (reverse): "' + name + '" (' + pinCount + ' pins)');
          }
        }
      });
    } catch (e) {}

    // Strategy 2: Scan DOM for visible section links
    // Only include sections that are actually rendered in visible containers
    var allLinks = document.querySelectorAll('a[href]');
    allLinks.forEach(function(link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf(boardPath + '/') === 0) {
        var remainder = href.slice(boardPath.length + 1).split('/')[0].split('?')[0];
        // Allow any length section name (removed length > 2 restriction)
        if (remainder && isValidSection(remainder)) {
          // Verify it's in a visible container (not hidden system element)
          var container = link.closest('[data-test-id]') || link.parentElement?.parentElement?.parentElement;
          if (container) {
            // Check if container is visible and has pin count text
            var containerText = container.textContent || '';
            var countMatch = containerText.match(/(\d+)\s*(?:pins?|Pins?)/i);
            if (countMatch) {
              var pinCount = parseInt(countMatch[1], 10);
              var name = decodeURIComponent(remainder).replace(/-/g, ' ');
              if (!sectionMap.has(remainder)) {
                sectionMap.set(remainder, { name: name, pinCount: pinCount });
                console.log('[PA] Found section from DOM: "' + name + '" (' + pinCount + ' pins)');
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
    console.log('[PA] Total sections found: ' + boardSections.length);
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

  // Update the UI info panel when URL changes (dynamic navigation)
  async function updateUIForNewPage() {
    // Always reset on page change - stop any in-progress download
    scrollAbort = true;

    // Reset state for new page
    boardSections = [];
    currentSection = null;
    totalPins = 0;
    boardName = '';

    // Get new page info
    var info = await getBoardInfo();
    safeName = boardName.replace(/[^a-zA-Z0-9]/g, '_');

    // Update the info panel
    var infoPanel = document.querySelector('#pa-overlay .pa-i');
    if (infoPanel) {
      var html = '<div class="pa-n">' + esc(info.n) + '</div>';
      if (info.section) {
        html += '<div class="pa-p" style="color:#e60023">Section: ' + esc(info.section) + '</div>';
      }
      html += '<div class="pa-p">' + info.t.toLocaleString() + ' pins</div>';
      infoPanel.innerHTML = html;
    }

    // Update sections panel
    var sectionsPanel = document.getElementById('pa-sections-panel');
    if (sectionsPanel) {
      if (info.section) {
        // On a section page - hide sections panel
        sectionsPanel.innerHTML = '';
      } else {
        // On main board - show loading and detect sections
        sectionsPanel.innerHTML = '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">' +
          '<div style="font-weight:600;font-size:13px;margin-bottom:8px">Sections</div>' +
          '<div style="color:#888;font-size:12px;padding:8px 0;text-align:center">' +
          '<div style="display:inline-block;width:16px;height:16px;border:2px solid #ddd;border-top-color:#e60023;border-radius:50%;animation:pa-spin 1s linear infinite;margin-right:8px;vertical-align:middle"></div>' +
          'Loading sections...</div></div>';

        // Detect sections and update panel
        var sections = await detectSectionsAsync();
        updateSectionsPanelContent(sections, info);
      }
    }

    // Reset download state for new page
    isPlaying = false;
    isPaused = false;
    scrollAbort = false;
    downloadedFiles = [];
    downloadedPinIds = new Set();
    pinQueue = [];
    fileCounter = 0;
    activeDownloads = 0;
    boardGridContainer = null;
    reachedRecommendations = false;

    // Update progress bar area
    var dlCount = document.getElementById('pa-dl-count');
    if (dlCount) dlCount.textContent = '0 downloaded';

    var dlBar = document.getElementById('pa-dl-bar');
    if (dlBar) dlBar.style.width = '0%';

    // Update total pins display
    var dlTotal = document.getElementById('pa-dl-total');
    if (dlTotal) dlTotal.textContent = info.t + ' total';

    // Reset play/pause buttons
    var playBtn = document.getElementById('pa-play');
    var pauseBtn = document.getElementById('pa-pause');
    if (playBtn) {
      playBtn.disabled = false;
      playBtn.textContent = '▶ Play';
    }
    if (pauseBtn) {
      pauseBtn.disabled = true;
    }

    // Hide live status
    var liveStatus = document.getElementById('pa-live-status');
    if (liveStatus) liveStatus.style.display = 'none';

    // Reset status area
    var statusArea = document.getElementById('pa-s');
    var statusText = document.getElementById('pa-st');
    var progressBar = document.getElementById('pa-gb');
    if (statusArea) statusArea.classList.remove('on');
    if (statusText) statusText.textContent = 'Ready';
    if (progressBar) progressBar.style.width = '0%';

    // Hide message area
    var msgArea = document.getElementById('pa-m');
    if (msgArea) msgArea.classList.remove('on');

    console.log('[PA] UI updated for: ' + location.pathname);
  }

  // Helper to update sections panel content (extracted from createUI)
  function updateSectionsPanelContent(sections, info) {
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

    // Re-attach event listeners
    var scanBtn = document.getElementById('pa-scan-sections');
    if (scanBtn) {
      scanBtn.onclick = async function() {
        scanBtn.disabled = true;
        scanBtn.textContent = 'Scanning...';
        await detectSectionsAsync();
        updateSectionsPanelContent(boardSections, info);
      };
    }

    var selectAllCb = document.getElementById('pa-select-all-sections');
    if (selectAllCb) {
      selectAllCb.onchange = function() {
        document.querySelectorAll('.pa-section-cb[data-idx]').forEach(function(cb) {
          cb.checked = selectAllCb.checked;
        });
      };
    }
  }

  // Start watching for URL changes
  function startUrlWatcher() {
    if (urlWatchInterval) return;
    currentUrl = location.href;
    urlWatchInterval = setInterval(function() {
      if (location.href !== currentUrl) {
        console.log('[PA] URL changed: ' + currentUrl + ' -> ' + location.href);
        currentUrl = location.href;
        updateUIForNewPage();
      }
    }, 500);
  }

  // Stop watching for URL changes
  function stopUrlWatcher() {
    if (urlWatchInterval) {
      clearInterval(urlWatchInterval);
      urlWatchInterval = null;
    }
  }

  async function createUI() {
    var info = await getBoardInfo();
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
    html += '<span id="pa-dl-total">' + info.t + ' total</span>';
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
      stopUrlWatcher();
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

    // Start watching for URL changes (client-side navigation)
    startUrlWatcher();
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
  var pinCountBuffer = 1.15; // 15% buffer for Pinterest count inaccuracy (proven to work)
  var reachedRecommendations = false;
  var pinsBeforeMainBoard = 0; // Track section pins so main board cap only counts main board pins

  // TERTIARY: Sibling-based grid container filtering
  // Only collect pins within the same grid container as the first board pins
  var boardGridContainer = null;       // Cached grid container for main board
  var iframeGridContainers = new WeakMap(); // Cached grid containers per iframe document

  // Cache for section divider heading position (per document)
  var recHeadingCache = new WeakMap();

  // INVENTORY: Extract ALL pin IDs and URLs from Pinterest's JSON data in <script> tags
  // This is the authoritative source - Pinterest embeds complete board data here
  function extractPinInventoryFromJSON(doc) {
    var inventory = new Map(); // pinId -> {url}
    var scripts = doc.querySelectorAll('script:not([src])');

    scripts.forEach(function(script) {
      var text = script.textContent;
      if (!text || text.length < 100) return;

      // Find all pin IDs in the JSON
      // Pinterest uses multiple formats:
      // - Quoted string: "id":"474777985739200659" or "id":"AXhq..."
      // - Unquoted number: "id":474777985739200659

      // Pattern 1: Quoted IDs (alphanumeric, 10+ chars)
      var quotedPattern = /"id"\s*:\s*"([A-Za-z0-9_-]{10,})"/g;
      var match;
      while ((match = quotedPattern.exec(text)) !== null) {
        var pinId = match[1];
        if (inventory.has(pinId)) continue;

        var contextEnd = Math.min(text.length, match.index + 2000);
        var context = text.substring(match.index, contextEnd);

        var urlMatch = context.match(/"orig"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+pinimg\.com[^"]+)"/);
        if (urlMatch) {
          var url = urlMatch[1].replace(/\\u002F/g, '/');
          inventory.set(pinId, { url: url });
        }
      }

      // Pattern 2: Unquoted numeric IDs (15+ digits to avoid other numeric IDs)
      var unquotedPattern = /"id"\s*:\s*(\d{15,})/g;
      while ((match = unquotedPattern.exec(text)) !== null) {
        var pinId = match[1];
        if (inventory.has(pinId)) continue;

        var contextEnd = Math.min(text.length, match.index + 2000);
        var context = text.substring(match.index, contextEnd);

        var urlMatch = context.match(/"orig"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+pinimg\.com[^"]+)"/);
        if (urlMatch) {
          var url = urlMatch[1].replace(/\\u002F/g, '/');
          inventory.set(pinId, { url: url });
        }
      }
    });

    console.log('[PA] Inventory: Found ' + inventory.size + ' pins in JSON data');
    return inventory;
  }

  function findSectionDividerInDoc(doc) {
    // Check cache first
    if (recHeadingCache.has(doc)) return recHeadingCache.get(doc);

    // Find h1/h2 that acts as a divider between board pins and recommendations
    // Key insight: the divider h1/h2 is NOT inside a pin container
    // It appears as a standalone heading between the pin grid and recommendation grid
    var headings = doc.querySelectorAll('h1, h2');

    for (var i = 0; i < headings.length; i++) {
      var heading = headings[i];

      // Skip headings that are inside pin containers (these are pin titles, not dividers)
      if (heading.closest('[data-test-id="pin"], [data-grid-item="true"]')) continue;

      // Skip headings in navigation/header areas
      if (heading.closest('header, nav, [role="navigation"]')) continue;

      // This is a standalone h1/h2 - likely the section divider
      // Check if there are pins both before AND after this heading
      var pinsAfter = false;
      var allPins = doc.querySelectorAll('a[href*="/pin/"]');
      for (var j = 0; j < allPins.length; j++) {
        var pin = allPins[j];
        var position = heading.compareDocumentPosition(pin);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          pinsAfter = true;
          break;
        }
      }

      if (pinsAfter) {
        console.log('[PA] Found section divider h1/h2:', (heading.textContent || '').substring(0, 50));
        recHeadingCache.set(doc, heading);
        return heading;
      }
    }

    recHeadingCache.set(doc, null);
    return null;
  }

  function isInRecommendationSection(element) {
    var doc = element.ownerDocument || document;
    var isIframe = doc !== document;

    // Get the grid container - h1/h2 detection only applies AFTER the grid
    var gridContainer = getGridContainer(doc);

    // Helper: Check if a heading is AFTER the grid container (not before/title)
    function isHeadingAfterGrid(heading) {
      if (!gridContainer) return false;

      // Check if heading comes AFTER grid container in DOM order
      var position = gridContainer.compareDocumentPosition(heading);
      // DOCUMENT_POSITION_FOLLOWING means heading comes after gridContainer
      if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
        return false; // Heading is before or inside grid - likely title
      }

      // Also skip headings that are very near the top of the page (likely title)
      var rect = heading.getBoundingClientRect();
      if (rect.top < 300) {
        return false; // Too close to top, probably title
      }

      return true;
    }

    // STRATEGY 1: Structural detection for iframes
    if (isIframe) {
      var divider = findSectionDividerInDoc(doc);
      if (divider && isHeadingAfterGrid(divider)) {
        var position = divider.compareDocumentPosition(element);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
          console.log('[PA] Element is AFTER section divider (post-grid)');
          return true;
        }
      }
    }

    // STRATEGY 2: Walk up DOM checking previous siblings for h1/h2
    // Only trigger on h1/h2 that comes AFTER the grid container
    var current = element;
    var stepsUp = 0;
    while (current && stepsUp < 12) {
      var prev = current.previousElementSibling;
      while (prev) {
        // Check if this sibling IS an h1/h2 (not inside a pin)
        if (prev.matches('h1, h2') && !prev.closest('[data-test-id="pin"], [data-grid-item="true"]')) {
          if (isHeadingAfterGrid(prev)) {
            console.log('[PA] Found h1/h2 sibling divider (post-grid):', (prev.textContent || '').substring(0, 40));
            return true;
          }
        }

        // Check if this sibling CONTAINS an h1/h2 (not inside a pin)
        var heading = prev.querySelector('h1, h2');
        if (heading && !heading.closest('[data-test-id="pin"], [data-grid-item="true"]')) {
          if (isHeadingAfterGrid(heading)) {
            console.log('[PA] Found h1/h2 in sibling (post-grid):', (heading.textContent || '').substring(0, 40));
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

  // ========== SIBLING-BASED GRID FILTERING ==========
  // Third filter: Only collect pins within the same grid container as first board pins
  // This ensures we get all siblings in the board grid before hitting recommendation grids

  /**
   * Find the grid container that holds board pins
   * Walks up from a pin element until finding a container with multiple pins
   */
  function findGridContainer(pinElement, doc) {
    var current = pinElement;
    var iterations = 0;
    var maxIterations = 15; // Don't walk too far up

    while (current && current !== doc.body && iterations < maxIterations) {
      current = current.parentElement;
      if (!current) break;
      iterations++;

      // Count pins inside this container
      var pinsInside = current.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');

      // A valid grid container should have 3+ pins
      // 1 could be a pin wrapper, 2 could be coincidence
      if (pinsInside.length >= 3) {
        return current;
      }
    }

    return null;
  }

  /**
   * Get or detect the grid container for a document
   * For main board with sections: finds the SECOND grid (pins grid, not sections grid)
   * Caches result to avoid repeated DOM walks
   */
  function getGridContainer(doc) {
    var isMainDoc = (doc === document);

    // Check cache first
    if (isMainDoc && boardGridContainer) {
      return boardGridContainer;
    }
    if (!isMainDoc && iframeGridContainers.has(doc)) {
      return iframeGridContainers.get(doc);
    }

    var gridContainer = null;

    // For main document with sections, we need to find the PINS grid, not the sections grid
    // The sections are often in the first grid, main board pins in the second
    if (isMainDoc && boardSections.length > 0) {
      console.log('[PA] Board has ' + boardSections.length + ' sections - looking for pins grid (not sections grid)');

      // Find ALL grids that contain pin links (a[href*="/pin/"])
      var allPins = doc.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');
      var gridsWithPins = new Map(); // grid -> count of actual pins (with /pin/ links)

      allPins.forEach(function(pinContainer) {
        // Only count containers that have actual pin links (not section thumbnails)
        var pinLink = pinContainer.querySelector('a[href*="/pin/"]');
        if (!pinLink) return;

        var grid = findGridContainer(pinContainer, doc);
        if (grid) {
          gridsWithPins.set(grid, (gridsWithPins.get(grid) || 0) + 1);
        }
      });

      // Find the grid with the most actual pins
      var bestCount = 0;
      gridsWithPins.forEach(function(count, grid) {
        if (count > bestCount) {
          bestCount = count;
          gridContainer = grid;
        }
      });

      if (gridContainer) {
        console.log('[PA] Found main pins grid with ' + bestCount + ' pins');
        // Only cache if we found enough pins - otherwise re-detect next time
        if (bestCount < 10) {
          console.log('[PA] Grid has few pins - will re-detect next scan (not caching)');
          return gridContainer; // Return but don't cache
        }
      }
    } else {
      // For iframes or boards without sections, use first pin approach
      var firstPin = doc.querySelector('[data-test-id="pin"], [data-grid-item="true"]');
      if (firstPin) {
        gridContainer = findGridContainer(firstPin, doc);
      }
    }

    if (!gridContainer) {
      console.log('[PA] WARNING: Could not determine grid container');
      return null; // Don't cache null either - try again next time
    }

    // Cache the result
    if (isMainDoc) {
      boardGridContainer = gridContainer;
    } else {
      iframeGridContainers.set(doc, gridContainer);
    }

    return gridContainer;
  }

  /**
   * Check if a pin element is within the board's grid container
   * Returns true if pin is in grid OR if grid couldn't be determined (fail open)
   */
  function isInBoardGrid(pinElement) {
    var doc = pinElement.ownerDocument || document;
    var gridContainer = getGridContainer(doc);

    // If we couldn't determine grid, allow the pin (fail open)
    // Other filters (cap, recommendation detection) still apply
    if (!gridContainer) {
      return true;
    }

    return gridContainer.contains(pinElement);
  }
  // ========== END SIBLING-BASED GRID FILTERING ==========

  // Fetch media (images, videos, GIFs)
  async function fetchMedia(url, type) {
    try {
      var r = await fetch(url);
      if (!r.ok) throw new Error();
      return await r.arrayBuffer();
    } catch (e) {
      // Fallback for images - try lower resolution
      if (type === 'jpg' || !type) {
        try {
          var r2 = await fetch(url.replace('/originals/', '/736x/'));
          if (!r2.ok) throw new Error();
          return await r2.arrayBuffer();
        } catch (e2) { return null; }
      }
      return null;
    }
  }


  // Scan DOM for new pins and add to queue
  // CRITICAL: Claim pin IDs immediately in downloadedPinIds to prevent duplicates with parallel workers
  // HYBRID FILTERING: Hard cap + recommendation section detection
  var skippedRecs = 0;
  function scanForNewPins() {
    var found = 0;

    // CAP CHECK DISABLED - relying on grid container filtering instead
    // var maxPins = Math.ceil(expectedPinCount * pinCountBuffer);
    // var mainBoardPinCount = downloadedPinIds.size - pinsBeforeMainBoard;
    // if (expectedPinCount > 0 && mainBoardPinCount >= maxPins) {
    //   console.log('[PA] Reached pin cap: ' + mainBoardPinCount + '/' + maxPins + ' main board pins');
    //   return 0;
    // }

    var pinElements = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');

    pinElements.forEach(function(container) {
      if (container.dataset.paQueued || container.dataset.paDownloaded || container.dataset.paSkipped) return;
      if (container.closest('header, nav')) return;

      // CAP CHECK DISABLED - relying on grid container filtering instead
      // var mbCount = downloadedPinIds.size - pinsBeforeMainBoard;
      // if (expectedPinCount > 0 && mbCount >= maxPins) return;

      // PRIMARY CHECK: Is this pin within the board's grid container?
      // This ensures we only collect pins from the same grid as board pins
      if (!isInBoardGrid(container)) {
        container.dataset.paSkipped = 'outside-grid';
        return;
      }

      // SECONDARY CHECK: Are we in recommendations section?
      // Grid container filtering is primary, but keep this as backup
      if (!reachedRecommendations && isInRecommendationSection(container)) {
        reachedRecommendations = true;
        console.log('[PA] Entered recommendations section (h1/h2 detected)');
      }
      if (reachedRecommendations) {
        container.dataset.paSkipped = 'recommendation';
        skippedRecs++;
        return;
      }

      var link = container.querySelector('a[href*="/pin/"]');
      if (!link) return;
      var match = link.href.match(/\/pin\/([^\/]+)/);
      if (!match) return;
      var pinId = match[1];
      if (downloadedPinIds.has(pinId)) return;

      var img = container.querySelector('img[src*="pinimg.com"]');
      if (!img) img = container.querySelector('img[srcset*="pinimg.com"]');
      if (!img) return;

      var imgUrl = img.src || (img.srcset ? img.srcset.split(' ')[0] : null);
      if (!imgUrl || !isValidPinImage(imgUrl)) return;

      var origUrl = getOriginalUrl(imgUrl);
      if (!origUrl) return;

      downloadedPinIds.add(pinId);
      container.dataset.paQueued = 'true';
      fileCounter++;
      pinQueue.push({
        pinId: pinId,
        url: origUrl,
        element: container,
        fileNum: fileCounter
      });
      found++;
    });

    // NOTE: Script tag scanning removed - we rely on DOM elements within board container
    // JSON pins can't be verified for container membership
    return found;
  }

  // Continuous parallel workers - grab pins IMMEDIATELY, don't wait for batches
  // Order preserved via fileNum (assigned at queue time) + final sort before ZIP
  // Duplicates prevented by downloadedPinIds (checked before queuing)
  var isScrolling = false;
  var workersRunning = 0;

  async function downloadWorker() {
    workersRunning++;
    while (isPlaying && !isPaused) {
      if (pinQueue.length === 0) {
        if (!isScrolling) break;
        await sleep(10); // Fast polling when queue empty
        continue;
      }

      var item = pinQueue.shift();
      if (!item) continue;

      activeDownloads++;
      updateLiveStats();

      var data = await fetchMedia(item.url);
      if (data) {
        downloadedFiles.push({
          name: item.filePath || (safeName + '/' + String(item.fileNum).padStart(5, '0') + '.jpg'),
          data: data,
          crc: crc32(new Uint8Array(data))
        });
      }

      if (item.element) {
        item.element.dataset.paDownloaded = 'true';
        item.element.style.opacity = '0.3';
      }

      activeDownloads--;
      updateLiveStats();
    }
    workersRunning--;
  }

  function startWorkers() {
    for (var i = 0; i < MAX_PARALLEL; i++) {
      downloadWorker(); // Fire and forget - runs in parallel
    }
  }

  async function waitForWorkers() {
    while (workersRunning > 0 || pinQueue.length > 0) {
      await sleep(50);
      updateLiveStats();
    }
  }

  // Scroll loop - continuously scrolls to load more pins
  // Uses grid container filtering (primary) + recommendation detection (secondary)
  async function scrollLoop() {
    var noNewPinsCount = 0;
    var lastTotalPins = pinQueue.length + downloadedFiles.length;

    // CRITICAL: Scan pins at current position FIRST before any scrolling
    scanForNewPins();
    updateLiveStats();
    await sleep(150);

    while (isPlaying && !isPaused && !scrollAbort) {
      // Stop immediately if we hit the target pin count
      var mainBoardPinsClaimed = downloadedPinIds.size - pinsBeforeMainBoard;
      if (expectedPinCount > 0 && mainBoardPinsClaimed >= expectedPinCount) {
        stat('Target reached: ' + expectedPinCount + ' pins', 1);
        console.log('[PA] Target reached: ' + mainBoardPinsClaimed + '/' + expectedPinCount + ' - stopping immediately');
        break;
      }

      // Stop if we reached recommendations (grid container filtering is primary)
      if (reachedRecommendations) {
        stat('Reached recommendations section', 1);
        console.log('[PA] Stopping: reached recommendations section');
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

    console.warn('[PA] === DOWNLOAD CONFIG ===');
    console.warn('[PA] downloadMainBoard:', downloadMainBoard);
    console.warn('[PA] selectedSections:', selectedSections.length, selectedSections.map(function(s){return s.name + '(' + s.pinCount + ')';}).join(', '));
    console.warn('[PA] totalPins:', totalPins);
    console.log('[PA] Using BOARD ID VERIFICATION to filter recommendations');

    // SECTIONS FIRST (Rule 2 from CLAUDE.md)
    if (selectedSections.length > 0) {
      for (var i = 0; i < selectedSections.length && !isPaused; i++) {
        var section = selectedSections[i];
        var sectionUrl = 'https://www.pinterest.com' + section.url;
        stat('Scanning section ' + (i + 1) + '/' + selectedSections.length + ': ' + section.name, i / selectedSections.length);

        var result = await collectFromSectionIframe(sectionUrl, section.name, section.pinCount);

        // Download section images using parallel workers
        var sectionFolder = safeName + '/' + section.name.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        var sectionCounter = 0;
        var sectionStartCount = downloadedFiles.length;

        // Queue all section pins for parallel download
        for (var j = 0; j < result.urls.length; j++) {
          var item = result.urls[j];
          if (downloadedPinIds.has(item.pinId)) continue; // Already claimed (from another section)
          downloadedPinIds.add(item.pinId); // CLAIM IMMEDIATELY before fetch
          sectionCounter++;
          pinQueue.push({
            pinId: item.pinId,
            url: item.url,
            element: null,
            filePath: sectionFolder + '/' + String(sectionCounter).padStart(5, '0') + '.jpg'
          });
        }

        // Start parallel workers and wait for section to complete
        if (pinQueue.length > 0 && !isPaused) {
          isScrolling = false; // Workers exit when queue empties
          startWorkers();
          await waitForWorkers();
        }

        var liveText = document.getElementById('pa-live-text');
        var sectionSaved = downloadedFiles.length - sectionStartCount;
        if (liveText) liveText.textContent = 'Section "' + section.name + '": ' + sectionSaved + ' saved';
      }
    }

    // Download main board if selected (after sections)
    console.warn('[PA] === MAIN BOARD CHECK ===');
    console.warn('[PA] downloadMainBoard=' + downloadMainBoard + ', isPaused=' + isPaused);
    if (downloadMainBoard && !isPaused) {
      stat('Downloading main board...', 0);

      // Calculate expected main board pins (total minus section pins)
      var sectionPinTotal = boardSections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
      expectedPinCount = Math.max(0, totalPins - sectionPinTotal);
      reachedRecommendations = false;
      skippedRecs = 0;
      boardGridContainer = null; // Reset grid container for fresh detection

      // CRITICAL: Track how many pins were downloaded BEFORE main board
      // So we only count MAIN BOARD pins against the cap, not section pins
      pinsBeforeMainBoard = downloadedPinIds.size;
      var filesBeforeMainBoard = downloadedFiles.length;

      console.warn('[PA] Main board: expecting ~' + expectedPinCount + ' pins (total: ' + totalPins + ' - sections: ' + sectionPinTotal + ')');
      console.warn('[PA] Pins already downloaded (sections): ' + pinsBeforeMainBoard);
      if (expectedPinCount === 0) {
        console.warn('[PA] WARNING: expectedPinCount is 0! Section pins >= total pins. Will try to collect anyway.');
      }
      console.log('[PA] Will cap at ' + Math.ceil(expectedPinCount * pinCountBuffer) + ' pins (with ' + Math.round((pinCountBuffer - 1) * 100) + '% buffer)');

      // Start from top of page
      window.scrollTo(0, 0);
      await sleep(500);

      // Start workers IMMEDIATELY - they'll grab pins as soon as they're queued
      isScrolling = true;
      startWorkers();

      // Run scroll loop (workers download in parallel)
      await scrollLoop();
      isScrolling = false;

      // Wait for remaining downloads to finish
      await waitForWorkers();

      // FINAL SWEEP: Multiple passes to catch ALL lazy-loaded board pins
      // Skip if we already have all expected pins
      var mainBoardDownloaded = downloadedFiles.length - filesBeforeMainBoard;
      if (mainBoardDownloaded >= expectedPinCount && expectedPinCount > 0) {
        console.log('[PA] Already have all ' + expectedPinCount + ' pins - skipping final sweep');
        stat('All ' + expectedPinCount + ' pins collected', 1);
      } else {
      // Pinterest lazy-loads images - need to scroll multiple times to trigger all loading
      // Grid container filtering is primary, recommendation detection is backup
      stat('Final sweep for missed pins...', 0.95);

      for (var pass = 0; pass < 3 && !isPaused; pass++) {
        // Stop if we've reached recommendations (grid filtering is primary)
        if (reachedRecommendations) {
          console.log('[PA] Final sweep: reached recommendations, skipping pass ' + (pass + 1));
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

        // Start workers for final sweep
        isScrolling = true;
        startWorkers();

        // Scroll through entire page slowly to catch everything
        while (scrollPos < pageHeight && !isPaused && !reachedRecommendations) {
          window.scrollTo(0, scrollPos);
          await sleep(300);

          var found = scanForNewPins();
          foundInPass += found;
          updateLiveStats();

          scrollPos += scrollStep;
        }

        isScrolling = false;
        await waitForWorkers();

        stat('Pass ' + (pass + 1) + '/3: found ' + foundInPass + ' more board pins (skipped ' + skippedRecs + ' recs)', 0.95 + (pass * 0.015));

        // If we didn't find any new board pins in this pass, we're done
        if (foundInPass === 0) break;
      }

      stat('Finishing downloads...', 0.99);
      } // end else (final sweep)
    }

    // VERIFICATION: Check for any pins missed by DOM scanning
    // Skip if we already have all expected pins
    if (!isPaused && totalPins > 0 && downloadedFiles.length < totalPins) {
      // First try JSON inventory
      await verifyAndDownloadMissing(totalPins);

      // Then do a final DOM sweep for any unprocessed pins
      await finalDOMVerification();
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

  // VERIFICATION: Check JSON inventory for any pins missed by DOM scanning
  async function verifyAndDownloadMissing(expectedCount) {
    var currentCount = downloadedPinIds.size;
    console.log('[PA] Verification: Have ' + currentCount + '/' + expectedCount + ' pins');

    // Extract complete inventory from JSON
    var inventory = extractPinInventoryFromJSON(document);

    // Check inventory count vs expected
    if (inventory.size < expectedCount) {
      console.log('[PA] Warning: JSON inventory (' + inventory.size + ') < expected (' + expectedCount + ')');
    }

    // Find pins we don't have
    var missingPins = [];
    inventory.forEach(function(data, pinId) {
      if (!downloadedPinIds.has(pinId)) {
        missingPins.push({ pinId: pinId, url: data.url });
      }
    });

    if (missingPins.length === 0) {
      console.log('[PA] Verification: All pins accounted for');
      return;
    }

    console.log('[PA] Found ' + missingPins.length + ' missing pins to download');
    stat('Downloading ' + missingPins.length + ' missing pins...', 0.95);

    // Queue missing pins for download (uses existing parallel workers)
    missingPins.forEach(function(pin) {
      if (!downloadedPinIds.has(pin.pinId) && pin.url) {
        downloadedPinIds.add(pin.pinId);
        fileCounter++;
        pinQueue.push({
          pinId: pin.pinId,
          url: getOriginalUrl(pin.url),
          element: null, // No DOM element for inventory pins
          fileNum: fileCounter
        });
      }
    });

    // Start workers if not running, wait for queue to drain
    isScrolling = true;
    startWorkers();

    while (pinQueue.length > 0 || activeDownloads > 0) {
      await sleep(100);
      updateLiveStats();
    }

    isScrolling = false;
    console.log('[PA] Verification complete: ' + downloadedFiles.length + ' total pins');
  }

  // FINAL DOM VERIFICATION: Catch any pins in the DOM that weren't processed
  // This is a last-resort scan that ignores grid filtering
  async function finalDOMVerification() {
    console.log('[PA] Final DOM verification - scanning all pins in page...');

    var allPinContainers = document.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');
    var foundMissing = 0;

    allPinContainers.forEach(function(container) {
      // Skip if already processed
      if (container.dataset.paQueued || container.dataset.paDownloaded || container.dataset.paSkipped) {
        return;
      }

      // Find pin link
      var link = container.querySelector('a[href*="/pin/"]');
      if (!link) return;

      var match = link.href.match(/\/pin\/([^\/]+)/);
      if (!match) return;

      var pinId = match[1];

      // Skip if already downloaded
      if (downloadedPinIds.has(pinId)) return;

      // Find image
      var img = container.querySelector('img[src*="pinimg.com"]');
      if (!img) img = container.querySelector('img[srcset*="pinimg.com"]');
      if (!img) return;

      var imgUrl = img.src || (img.srcset ? img.srcset.split(' ')[0] : null);
      if (!imgUrl || !isValidPinImage(imgUrl)) return;

      var origUrl = getOriginalUrl(imgUrl);
      if (!origUrl) return;

      // This pin was missed! Queue it for download
      console.log('[PA] Final verification: found missed pin ' + pinId);
      foundMissing++;

      downloadedPinIds.add(pinId);
      fileCounter++;
      pinQueue.push({
        pinId: pinId,
        url: origUrl,
        element: container,
        fileNum: fileCounter
      });
      container.dataset.paQueued = 'true';
    });

    if (foundMissing === 0) {
      console.log('[PA] Final DOM verification: no missed pins found');
      return;
    }

    console.log('[PA] Final verification: queued ' + foundMissing + ' missed pins');
    stat('Downloading ' + foundMissing + ' missed pins...', 0.98);

    // Download the missed pins
    isScrolling = true;
    startWorkers();

    while (pinQueue.length > 0 || activeDownloads > 0) {
      await sleep(100);
      updateLiveStats();
    }

    isScrolling = false;
    console.log('[PA] Final verification complete: ' + downloadedFiles.length + ' total pins');
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
      for (var w = 0; w < 20 && !loaded; w++) await sleep(250);
      if (!loaded) { iframe.remove(); resolve({ urls: [], pinIds: new Set() }); return; }
      await sleep(800); // Wait for React hydration
      var iframeDoc;
      try { iframeDoc = iframe.contentDocument || iframe.contentWindow.document; }
      catch (e) { iframe.remove(); resolve({ urls: [], pinIds: new Set() }); return; }

      var pinData = new Map(), iframeWin = iframe.contentWindow;
      var target = sectionExpectedCount || 50;
      // CAP DISABLED - relying on grid container filtering instead
      var sectionReachedRecs = false;
      var skippedRecs = 0;
      console.log('[PA] Section "' + sectionName + '": target=' + target + ' (grid filtering enabled)');
      stat('Scanning "' + sectionName + '" (expecting ~' + target + ')...', 0);

      function collect() {
        iframeDoc.querySelectorAll('a[href*="/pin/"]').forEach(function(link) {

          var m = link.href.match(/\/pin\/([^\/]+)/);
          if (!m || pinData.has(m[1])) return;

          var pinId = m[1];

          var c = link.closest('[data-test-id="pin"]') || link.closest('[data-grid-item="true"]');
          if (!c) c = link.parentElement && link.parentElement.parentElement && link.parentElement.parentElement.parentElement;
          if (!c) return;

          // TERTIARY CHECK: Is this pin within the section's grid container?
          if (!isInBoardGrid(c)) {
            return;
          }

          // SECONDARY: Check for recommendation section (grid filtering is primary)
          if (!sectionReachedRecs && isInRecommendationSection(c)) {
            sectionReachedRecs = true;
            console.log('[PA] Section "' + sectionName + '" reached recs (h1/h2 detected)');
          }
          if (sectionReachedRecs) {
            skippedRecs++;
            return;
          }

          var img = c.querySelector('img[src*="pinimg.com"]');
          if (!img) return;
          var imgUrl = img.src;
          if (!imgUrl || !isValidPinImage(imgUrl)) return;
          var origUrl = getOriginalUrl(imgUrl);
          if (origUrl) pinData.set(pinId, origUrl);
        });
      }

      collect();
      var lastCt = 0, sameCt = 0;
      for (var s = 0; s < 150; s++) {
        // Stop if we reached recommendations (grid filtering is primary)
        if (sectionReachedRecs) break;

        iframeWin.scrollBy(0, iframeWin.innerHeight * 3);
        await sleep(120);
        collect();
        var ct = pinData.size;
        stat('"' + sectionName + '": ' + ct + '/' + target, ct / target);
        if (ct >= target) break;
        if (ct === lastCt) { sameCt++; if (sameCt > 8) break; } else { sameCt = 0; lastCt = ct; }
      }

      var stopReason = sectionReachedRecs ? 'recommendations detected' : (pinData.size >= target ? 'target reached' : 'no more pins');
      console.log('[PA] Section "' + sectionName + '" complete: ' + pinData.size + '/' + target + ' pins (' + stopReason + ')' + (skippedRecs > 0 ? ', skipped ' + skippedRecs + ' recs' : ''));

      // VERIFICATION: Check JSON inventory for any pins missed by DOM scanning
      var sectionInventory = extractPinInventoryFromJSON(iframeDoc);
      console.log('[PA] Section "' + sectionName + '": Inventory has ' + sectionInventory.size + ' pins');

      // Find and recover any pins we missed
      var recovered = 0;
      sectionInventory.forEach(function(data, pinId) {
        if (!pinData.has(pinId) && data.url) {
          pinData.set(pinId, getOriginalUrl(data.url));
          recovered++;
        }
      });
      if (recovered > 0) {
        console.log('[PA] Section "' + sectionName + '" verification: recovered ' + recovered + ' missed pins');
      }
      console.log('[PA] Section "' + sectionName + '" after verification: ' + pinData.size + ' pins');

      var urls = [], pinIds = new Set();
      pinData.forEach(function(url, id) {
        if (url) {
          urls.push({ url: url, pinId: id });
          pinIds.add(id);
        }
      });
      iframe.remove();
      resolve({ urls: urls, pinIds: pinIds });
    });
  }

  createUI();
})(); // LATEST VERSION - v12.3 DYNAMIC UI (complete reset on page change)
