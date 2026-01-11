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
  s.textContent = '#pa-overlay{position:fixed;top:20px;right:20px;width:24rem;background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.30);z-index:999999;font-family:inherit;color:#111;max-height:90vh;overflow:hidden}#pa-overlay *{box-sizing:border-box}.pa-c{padding:1.25rem;overflow-y:auto}.pa-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:.9rem;margin-bottom:.8rem;border-bottom:1px solid #efefef}.pa-header h2{margin:0;font-size:16px;font-weight:400}.pa-x{background:none;border:none;cursor:pointer;color:#767676;padding:0;display:flex;align-items:center;justify-content:center}.pa-n{font-size:1.8rem;font-weight:700;margin:0;padding-top:1.95rem;padding-bottom:.4rem;line-height:1.2}.pa-pin-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.pa-p{font-size:14px;color:#767676}.pa-scan{background:none;border:none;font-size:14px;color:#767676;cursor:pointer;padding:0}.pa-scan:hover{text-decoration:underline}#pa-sections-panel{transition:height 0.25s ease;overflow:hidden}.pa-sec-group{margin-bottom:16px;border-top:1px solid #E4E4E4;padding-top:.5rem;padding-bottom:1.26rem}.pa-sec-header{display:flex;align-items:center;margin-bottom:12px}.pa-sec-header input{width:16px;height:16px;margin:0 10px 0 0;cursor:pointer;-webkit-appearance:none;appearance:none;border-radius:50%;background:#E6E6E6;border:none;position:relative}.pa-sec-header input:checked{background:#111}.pa-sec-header input:checked::after{content:"\\2713";color:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;line-height:1}.pa-sec-label{font-size:15px;font-weight:400}.pa-sec-list{max-height:140px;overflow-y:auto;margin-left:26px}.pa-sec-item{display:flex;align-items:center;padding:6px 0}.pa-sec-item input{width:14px;height:14px;margin:0 10px 0 0;cursor:pointer;-webkit-appearance:none;appearance:none;border-radius:0;background:#E6E6E6;border:none;position:relative}.pa-sec-item input:checked{background:#111}.pa-sec-item input:checked::after{content:"\\2713";color:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:9px;line-height:1}.pa-sec-name{flex:1;font-size:14px;color:#111;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pa-sec-pins{font-size:14px;color:#767676;margin-left:12px}.pa-main{display:flex;align-items:center;padding:.5rem 0 1.26rem 0;margin-bottom:20px;border-top:1px solid #E4E4E4}.pa-main input{width:16px;height:16px;margin:0 10px 0 0;cursor:pointer;-webkit-appearance:none;appearance:none;border-radius:50%;background:#E6E6E6;border:none;position:relative}.pa-main input:checked{background:#111}.pa-main input:checked::after{content:"\\2713";color:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:10px;line-height:1}.pa-main-label{font-size:15px;font-weight:400}.pa-main-pins{font-size:15px;color:#767676;margin-left:6px}.pa-btns{display:flex;gap:.2rem;margin-bottom:24px}.pa-btn{flex:1;height:2.4rem;padding:0 20px;border-radius:.6rem;font-size:15px;font-weight:400;cursor:pointer;border:none;transition:background-color .3s cubic-bezier(.4,0,.2,1);display:flex;align-items:center;justify-content:center}.pa-btn:disabled{opacity:.5;cursor:not-allowed}.pa-btn-start{background:#e60023;color:#fff}.pa-btn-start:hover{background:#f4737a}.pa-btn-downloading{background:#f4737a;color:#fff;cursor:default}.pa-btn-pause{background:#111;color:#fff}.pa-btn-done{background:#111;color:#fff;cursor:default}.pa-progress{margin-bottom:20px}.pa-progress-text{font-size:14px;color:#111;margin-bottom:8px}.pa-progress-bar{height:8px;background:#E6E6E6;border-radius:4px;overflow:hidden}.pa-progress-fill{height:100%;background:#000;width:0;transition:width .3s ease}.pa-author{display:flex;align-items:center;padding-top:17px;border-top:1px solid #efefef}.pa-author-label{font-size:14px;color:#111;margin-right:8px}.pa-author-dot{width:14px;height:14px;background:#f5a623;border-radius:50%;margin-right:6px}.pa-author-name{font-size:14px;color:#111;font-weight:400;cursor:pointer;transition:opacity .3s cubic-bezier(.4,0,.2,1)}.pa-author-name:hover{opacity:.4}.pa-m{display:none;padding:12px;background:#fff8e6;border-radius:8px;font-size:13px;margin-bottom:16px}.pa-m.on{display:block}@keyframes pa-spin{to{transform:rotate(360deg)}}.pa-spinner{display:inline-block;width:20px;height:20px;border:2px solid #efefef;border-top-color:#e60023;border-radius:50%;animation:pa-spin 1s linear infinite}.pa-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;color:#767676;font-size:13px}.pa-loading .pa-spinner{margin-bottom:12px}#pa-live-status{display:none;margin-bottom:16px}#pa-live-status.on{display:block}.pa-live{display:inline-block;width:8px;height:8px;background:#e60023;border-radius:50%;margin-right:8px;animation:pa-pulse .8s cubic-bezier(.4,0,.2,1) infinite}.pa-paused{background:#767676;animation:none}@keyframes pa-pulse{0%,100%{background:#e60023}50%{background:#f4737a}}';
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

    var sectionsPanel = document.getElementById('pa-sections-panel');

    // Determine page type from URL SYNCHRONOUSLY (no async wait)
    var pathParts = location.pathname.split('/').filter(Boolean);
    var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize'];
    var isGoingToSection = pathParts.length >= 3 && systemRoutes.indexOf(pathParts[2]) === -1;

    // Get expected title slug from URL for matching
    var expectedSlug = isGoingToSection ? pathParts[2] : (pathParts[1] || '');
    var expectedNorm = decodeURIComponent(expectedSlug).toLowerCase().replace(/[-\s]/g, '');

    // Check if DOM h1 already has the correct title (matches URL)
    var headingEl = document.querySelector('h1[title]') || document.querySelector('h1');
    var domTitle = '';
    var domReady = false;

    if (headingEl) {
      domTitle = headingEl.getAttribute('title') || headingEl.textContent.trim();
      var domNorm = domTitle.toLowerCase().replace(/[-\s]/g, '');
      // DOM is ready if it matches the URL we're navigating to
      if (domNorm && expectedNorm && (domNorm === expectedNorm ||
          domNorm.indexOf(expectedNorm) !== -1 || expectedNorm.indexOf(domNorm) !== -1)) {
        domReady = true;
      }
    }

    // Update title - only show if DOM is ready, otherwise leave empty until poll finds it
    var titleEl = document.getElementById('pa-title');
    if (titleEl) {
      titleEl.textContent = domReady ? domTitle : '';
    }

    // Update pin count to loading state
    var pinCountEl = document.getElementById('pa-pincount');
    if (pinCountEl) {
      pinCountEl.textContent = 'Loading...';
    }

    // Poll for DOM heading if not ready yet
    if (!domReady) {
      var pollCount = 0;
      var pollForTitle = setInterval(function() {
        var h1 = document.querySelector('h1[title]') || document.querySelector('h1');
        if (h1) {
          var title = h1.getAttribute('title') || h1.textContent.trim();
          var titleNorm = title.toLowerCase().replace(/[-\s]/g, '');
          // Check if h1 now matches the URL we navigated to
          if (titleNorm && expectedNorm && (titleNorm === expectedNorm ||
              titleNorm.indexOf(expectedNorm) !== -1 || expectedNorm.indexOf(titleNorm) !== -1)) {
            var titleEl = document.getElementById('pa-title');
            if (titleEl) titleEl.textContent = title;
            clearInterval(pollForTitle);
          }
        }
        pollCount++;
        if (pollCount > 40) clearInterval(pollForTitle); // Stop after 2s
      }, 50);
    }

    // Lock current height and start animation IMMEDIATELY
    if (sectionsPanel) {
      var oldSectionHeight = sectionsPanel.offsetHeight;
      sectionsPanel.style.height = oldSectionHeight + 'px';

      if (isGoingToSection) {
        // SHRINKING: Animate to 0 immediately
        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            sectionsPanel.style.height = '0px';
            setTimeout(function() {
              sectionsPanel.innerHTML = '';
              sectionsPanel.style.height = 'auto';
            }, 250);
          });
        });
      } else {
        // EXPANDING: Show loading spinner with new CSS classes
        sectionsPanel.innerHTML = '<div class="pa-loading"><div class="pa-spinner"></div><div>Loading sections...</div></div>';

        sectionsPanel.style.height = oldSectionHeight + 'px';
        var targetHeight = sectionsPanel.scrollHeight;

        requestAnimationFrame(function() {
          requestAnimationFrame(function() {
            sectionsPanel.style.height = targetHeight + 'px';
            setTimeout(function() {
              sectionsPanel.style.height = 'auto';
            }, 250);
          });
        });
      }
    }

    // Now do async work (animation already started)
    boardSections = [];
    currentSection = null;
    totalPins = 0;
    boardName = '';

    var info = await getBoardInfo();
    safeName = boardName.replace(/[^a-zA-Z0-9]/g, '_');

    // Update ONLY the pin count (title is handled by the poll above)
    var pinCountEl = document.getElementById('pa-pincount');
    if (pinCountEl) {
      pinCountEl.textContent = '~' + info.t.toLocaleString() + ' pins' + (info.section ? ' (section)' : '');
    }

    // For main board, detect and update sections (content swap only, no animation)
    if (!isGoingToSection && sectionsPanel) {
      var sections = await detectSectionsAsync();
      updateSectionsPanelContent(sections, info);
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
    if (dlCount) dlCount.textContent = '0';

    var dlBar = document.getElementById('pa-dl-bar');
    if (dlBar) dlBar.style.width = '0%';

    // Update total pins display
    var dlTotal = document.getElementById('pa-dl-total');
    if (dlTotal) dlTotal.textContent = info.t;

    // Reset play/pause buttons
    var playBtn = document.getElementById('pa-play');
    var pauseBtn = document.getElementById('pa-pause');
    if (playBtn) {
      playBtn.disabled = false;
      playBtn.textContent = 'Start';
    }
    if (pauseBtn) {
      pauseBtn.disabled = true;
    }

    // Hide live status
    var liveStatus = document.getElementById('pa-live-status');
    if (liveStatus) liveStatus.classList.remove('on');

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
      // Sections group
      html += '<div class="pa-sec-group">';
      html += '<label class="pa-sec-header">';
      html += '<input type="checkbox" id="pa-select-all-sections" checked>';
      html += '<span class="pa-sec-label">Sections (' + sections.length + ')</span>';
      html += '</label>';
      html += '<div class="pa-sec-list">';
      sections.forEach(function(sec, idx) {
        html += '<label class="pa-sec-item">';
        html += '<input type="checkbox" class="pa-section-cb" data-idx="' + idx + '" checked>';
        html += '<span class="pa-sec-name">' + esc(sec.name) + '</span>';
        html += '<span class="pa-sec-pins">' + sec.pinCount + ' pins</span>';
        html += '</label>';
      });
      html += '</div></div>';
    }

    // Main board option
    html += '<label class="pa-main">';
    html += '<input type="checkbox" class="pa-section-cb" data-main="true" checked>';
    html += '<span class="pa-main-label">Main board</span>';
    html += '<span class="pa-main-pins">(' + mainPinCount + ' pins)</span>';
    html += '</label>';

    panel.innerHTML = html;

    // Re-attach event listeners
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

    // Single container with consistent padding
    var html = '<div class="pa-c">';

    // Header row
    html += '<div class="pa-header"><h2>Pinterest Archiver</h2><button class="pa-x" id="pa-x"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>';

    // Board name
    html += '<div class="pa-n" id="pa-title">' + esc(info.n) + '</div>';

    // Pin count row
    html += '<div class="pa-pin-row">';
    html += '<span class="pa-p" id="pa-pincount">~' + info.t.toLocaleString() + ' pins' + (info.section ? ' (section)' : '') + '</span>';
    html += '</div>';

    // Sections panel
    html += '<div id="pa-sections-panel">';
    if (!info.section) {
      html += '<div class="pa-loading"><div class="pa-spinner"></div><div>Loading sections...</div></div>';
    }
    html += '</div>';

    // Buttons - show pause only for large boards (>500 pins)
    html += '<div class="pa-btns">';
    if (info.t > 500) {
      html += '<button class="pa-btn pa-btn-start" id="pa-play">Start</button>';
      html += '<button class="pa-btn pa-btn-pause" id="pa-pause" disabled>Pause & download</button>';
    } else {
      html += '<button class="pa-btn pa-btn-start" id="pa-play" style="flex:none;width:100%">Start</button>';
    }
    html += '</div>';

    // Live status (hidden by default)
    html += '<div id="pa-live-status">';
    html += '<div style="font-size:13px;margin-bottom:4px"><span class="pa-live"></span><span id="pa-live-text">Downloading...</span></div>';
    html += '<div style="font-size:12px;color:#767676">';
    html += '<span id="pa-stat-downloaded">0</span> downloaded · ';
    html += '<span id="pa-stat-queue">0</span> queued · ';
    html += '<span id="pa-stat-active">0</span> active</div>';
    html += '</div>';

    // Progress
    html += '<div class="pa-progress">';
    html += '<div class="pa-progress-text"><span id="pa-dl-count">0</span> / ~<span id="pa-dl-total">' + info.t + '</span> downloaded</div>';
    html += '<div class="pa-progress-bar"><div class="pa-progress-fill" id="pa-dl-bar"></div></div>';
    html += '</div>';

    // Message area (hidden by default)
    html += '<div class="pa-m" id="pa-m"></div>';

    // Author
    html += '<div class="pa-author">';
    html += '<span class="pa-author-label">Author:</span>';
    html += '<span class="pa-author-dot"></span>';
    html += '<a href="https://www.jbrandford.com" target="_blank" class="pa-author-name" style="text-decoration:none;color:#111">J.Brandford</a>';
    html += '</div>';

    html += '</div>'; // Close .pa-c
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('pa-x').onclick = function() {
      scrollAbort = true;
      isPaused = true;
      stopUrlWatcher();
      overlay.remove();
    };

    document.getElementById('pa-play').onclick = function() {
      if (!isPlaying && !this.classList.contains('pa-btn-done') && !this.classList.contains('pa-btn-downloading')) startStreamingDownload();
    };

    var pauseBtn = document.getElementById('pa-pause');
    if (pauseBtn) {
      pauseBtn.onclick = function() {
        if (isPlaying) pauseAndSave();
      };
    }

    function updateSectionsPanel(sections) {
      var panel = document.getElementById('pa-sections-panel');
      if (!panel) return;
      if (info.section) { panel.innerHTML = ''; return; }
      var sectionPinTotal = sections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
      var mainPinCount = Math.max(0, info.t - sectionPinTotal);

      var html = '';
      if (sections.length > 0) {
        // Sections group
        html += '<div class="pa-sec-group">';
        html += '<label class="pa-sec-header">';
        html += '<input type="checkbox" id="pa-select-all-sections" checked>';
        html += '<span class="pa-sec-label">Sections (' + sections.length + ')</span>';
        html += '</label>';
        html += '<div class="pa-sec-list">';
        sections.forEach(function(sec, idx) {
          html += '<label class="pa-sec-item">';
          html += '<input type="checkbox" class="pa-section-cb" data-idx="' + idx + '" checked>';
          html += '<span class="pa-sec-name">' + esc(sec.name) + '</span>';
          html += '<span class="pa-sec-pins">' + sec.pinCount + ' pins</span>';
          html += '</label>';
        });
        html += '</div></div>';
      }

      // Main board option
      html += '<label class="pa-main">';
      html += '<input type="checkbox" class="pa-section-cb" data-main="true" checked>';
      html += '<span class="pa-main-label">Main board</span>';
      html += '<span class="pa-main-pins">(' + mainPinCount + ' pins)</span>';
      html += '</label>';

      panel.innerHTML = html;

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
    // Show status in the live status area
    var liveText = document.getElementById('pa-live-text');
    if (liveText) liveText.textContent = text;
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
    if (countEl) countEl.textContent = downloadedFiles.length;
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
      // Stop immediately if we've downloaded enough pins
      if (expectedPinCount > 0 && pinsBeforeMainBoard >= 0) {
        var mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
        if (mainBoardDownloaded >= expectedPinCount) break;
      }

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
    while (workersRunning > 0) {
      // Also break if we've hit the target (workers may have stopped early)
      if (expectedPinCount > 0 && pinsBeforeMainBoard >= 0) {
        var mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
        if (mainBoardDownloaded >= expectedPinCount) break;
      }
      await sleep(50);
      updateLiveStats();
    }
    // Clear any remaining queue items (workers stopped at target)
    pinQueue.length = 0;
  }

  // Scroll loop - continuously scrolls to load more pins
  // Uses grid container filtering (primary) + recommendation detection (secondary)
  async function scrollLoop() {
    var noNewPinsCount = 0;
    var lastTotalPins = pinQueue.length + downloadedFiles.length;

    // CRITICAL: Scan pins at current position FIRST before any scrolling
    scanForNewPins();
    updateLiveStats();

    while (isPlaying && !isPaused && !scrollAbort) {
      // Stop immediately if we've DOWNLOADED enough pins (not just queued)
      var mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
      if (expectedPinCount > 0 && mainBoardDownloaded >= expectedPinCount) {
        console.log('[PA] Target downloaded: ' + mainBoardDownloaded + '/' + expectedPinCount + ' - stopping immediately');
        break;
      }

      // Stop if we reached recommendations (grid container filtering is primary)
      if (reachedRecommendations) {
        stat('Reached recommendations section', 1);
        console.log('[PA] Stopping: reached recommendations section');
        break;
      }

      window.scrollBy(0, window.innerHeight * 1.5);
      await sleep(50);

      var found = scanForNewPins();
      updateLiveStats();

      var currentTotal = pinQueue.length + downloadedFiles.length;
      if (currentTotal === lastTotalPins && found === 0) {
        noNewPinsCount++;
        if (noNewPinsCount > 20) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(200);
          // Check target during stuck detection
          mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
          if (expectedPinCount > 0 && mainBoardDownloaded >= expectedPinCount) break;
          scanForNewPins();
          var afterAggressiveTotal = pinQueue.length + downloadedFiles.length;
          if (afterAggressiveTotal === lastTotalPins) {
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

      // Update UI and check target one more time
      var liveText = document.getElementById('pa-live-text');
      mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
      if (liveText) {
        liveText.textContent = 'Downloading... ' + mainBoardDownloaded + '/' + expectedPinCount;
      }
      if (expectedPinCount > 0 && mainBoardDownloaded >= expectedPinCount) break;
    }
  }

  // Start streaming download
  async function startStreamingDownload() {
    if (isPlaying) return;

    isPlaying = true;
    isPaused = false;
    scrollAbort = false;

    // Update UI
    var playBtn = document.getElementById('pa-play');
    var pauseBtn = document.getElementById('pa-pause');
    playBtn.textContent = 'Downloading';
    playBtn.classList.remove('pa-btn-start');
    playBtn.classList.add('pa-btn-downloading');
    if (pauseBtn) pauseBtn.disabled = false;
    var liveStatus = document.getElementById('pa-live-status');
    if (liveStatus) liveStatus.classList.add('on');
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

      console.warn('[PA] Main board: expecting ~' + expectedPinCount + ' pins (total: ' + totalPins + ' - sections: ' + sectionPinTotal + ')');
      console.warn('[PA] Pins already downloaded (sections): ' + pinsBeforeMainBoard);
      if (expectedPinCount === 0) {
        console.warn('[PA] WARNING: expectedPinCount is 0! Section pins >= total pins. Will try to collect anyway.');
      }
      console.log('[PA] Will cap at ' + Math.ceil(expectedPinCount * pinCountBuffer) + ' pins (with ' + Math.round((pinCountBuffer - 1) * 100) + '% buffer)');

      // Start from top of page
      window.scrollTo(0, 0);
      await sleep(100);

      // Start workers IMMEDIATELY - they'll grab pins as soon as they're queued
      isScrolling = true;
      startWorkers();

      // Run scroll loop (workers download in parallel)
      await scrollLoop();
      isScrolling = false;
      pinQueue.length = 0; // Clear queue - stop workers from grabbing more

      // Save immediately with what we have
      var mainBoardDownloaded = downloadedFiles.length - pinsBeforeMainBoard;
      stat('Complete: ' + mainBoardDownloaded + ' pins', 1);
    }

    // Auto-save if not paused manually
    if (!isPaused) {
      await saveZip();
      // Update buttons to Done state
      var playBtn = document.getElementById('pa-play');
      var pauseBtn = document.getElementById('pa-pause');
      playBtn.textContent = 'Done';
      playBtn.classList.remove('pa-btn-start', 'pa-btn-downloading');
      playBtn.classList.add('pa-btn-done');
      if (pauseBtn) pauseBtn.disabled = true;
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
    var playBtn = document.getElementById('pa-play');
    var pauseBtn = document.getElementById('pa-pause');
    playBtn.disabled = false;
    playBtn.textContent = 'Resume';
    if (pauseBtn) pauseBtn.disabled = true;

    if (liveIndicator) liveIndicator.classList.remove('pa-paused');
  }

  // Save collected files to zip
  async function saveZip() {
    if (downloadedFiles.length === 0) {
      stat('No pins to save', 0);
      msg('<b>No pins collected.</b> Try scrolling the page first.');
      return;
    }

    stat('Creating zip...', 1);

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

    var liveStatus = document.getElementById('pa-live-status');
    if (liveStatus) liveStatus.classList.remove('on');
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
})(); // LATEST VERSION - v14.3 (no final sweep - scroll once, download immediately)
