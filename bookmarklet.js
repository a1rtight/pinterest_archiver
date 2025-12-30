// Pinterest Archiver Bookmarklet
// Downloads pin images into a single zip file with section support

(function() {
  var e = document.getElementById('pa-overlay');
  if (e) { e.remove(); return; }

  var totalPins = 0;
  var boardName = '';
  var isDownloading = false;
  var boardSections = []; // Array of {name, url, pinCount}
  var currentSection = null; // null = main board, otherwise section name

  var s = document.createElement('style');
  s.id = 'pa-styles';
  s.textContent = '#pa-overlay{position:fixed;top:20px;right:20px;width:340px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.2);z-index:999999;font-family:system-ui,sans-serif;color:#333;max-height:90vh;overflow:auto}#pa-overlay *{box-sizing:border-box}.pa-h{padding:16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff}.pa-h h2{margin:0;font-size:16px}.pa-x{background:none;border:none;font-size:20px;cursor:pointer;color:#666}.pa-c{padding:16px}.pa-i{margin-bottom:16px}.pa-n{font-size:18px;font-weight:600;margin-bottom:4px}.pa-p{font-size:14px;color:#666}.pa-t{font-size:12px;color:#888;margin:12px 0 8px;text-transform:uppercase}.pa-b{display:block;width:100%;padding:12px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:14px;cursor:pointer}.pa-b:hover{background:#f5f5f5}.pa-b:disabled{opacity:.5}.pa-bp{background:#e60023;color:#fff;border-color:#e60023}.pa-bp:hover{background:#ad081b}.pa-r{display:flex;gap:8px}.pa-r .pa-b{flex:1;margin:0}.pa-s{padding:12px;background:#f8f8f8;border-radius:8px;font-size:13px;color:#666;margin-top:12px;display:none}.pa-s.on{display:block}.pa-g{height:4px;background:#eee;border-radius:2px;margin-top:8px}.pa-gb{height:100%;background:#e60023;width:0;transition:width .3s}.pa-m{background:#fff3cd;padding:10px;border-radius:8px;font-size:12px;margin-top:12px;display:none}.pa-m.on{display:block}@keyframes pa-spin{to{transform:rotate(360deg)}}';
  document.head.appendChild(s);

  // Minimal ZIP file builder (uncompressed/store method)
  function createZip(files) {
    var localHeaders = [];
    var centralHeaders = [];
    var offset = 0;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var nameBytes = new TextEncoder().encode(file.name);
      var data = new Uint8Array(file.data);

      // Local file header
      var local = new Uint8Array(30 + nameBytes.length + data.length);
      var view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); // signature
      view.setUint16(4, 20, true); // version needed
      view.setUint16(6, 0, true); // flags
      view.setUint16(8, 0, true); // compression (store)
      view.setUint16(10, 0, true); // mod time
      view.setUint16(12, 0, true); // mod date
      view.setUint32(14, file.crc, true); // crc32
      view.setUint32(18, data.length, true); // compressed size
      view.setUint32(22, data.length, true); // uncompressed size
      view.setUint16(26, nameBytes.length, true); // name length
      view.setUint16(28, 0, true); // extra length
      local.set(nameBytes, 30);
      local.set(data, 30 + nameBytes.length);
      localHeaders.push(local);

      // Central directory header
      var central = new Uint8Array(46 + nameBytes.length);
      var cview = new DataView(central.buffer);
      cview.setUint32(0, 0x02014b50, true); // signature
      cview.setUint16(4, 20, true); // version made by
      cview.setUint16(6, 20, true); // version needed
      cview.setUint16(8, 0, true); // flags
      cview.setUint16(10, 0, true); // compression
      cview.setUint16(12, 0, true); // mod time
      cview.setUint16(14, 0, true); // mod date
      cview.setUint32(16, file.crc, true); // crc32
      cview.setUint32(20, data.length, true); // compressed size
      cview.setUint32(24, data.length, true); // uncompressed size
      cview.setUint16(28, nameBytes.length, true); // name length
      cview.setUint16(30, 0, true); // extra length
      cview.setUint16(32, 0, true); // comment length
      cview.setUint16(34, 0, true); // disk start
      cview.setUint16(36, 0, true); // internal attrs
      cview.setUint32(38, 0, true); // external attrs
      cview.setUint32(42, offset, true); // local header offset
      central.set(nameBytes, 46);
      centralHeaders.push(central);

      offset += local.length;
    }

    // End of central directory
    var centralSize = centralHeaders.reduce(function(a, b) { return a + b.length; }, 0);
    var endRecord = new Uint8Array(22);
    var eview = new DataView(endRecord.buffer);
    eview.setUint32(0, 0x06054b50, true); // signature
    eview.setUint16(4, 0, true); // disk number
    eview.setUint16(6, 0, true); // central dir disk
    eview.setUint16(8, files.length, true); // entries on disk
    eview.setUint16(10, files.length, true); // total entries
    eview.setUint32(12, centralSize, true); // central dir size
    eview.setUint32(16, offset, true); // central dir offset
    eview.setUint16(20, 0, true); // comment length

    // Combine all parts
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

  // CRC32 calculation
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

    // Detect if we're in a section (URL has extra path segment after board)
    var pathParts = location.pathname.split('/').filter(Boolean);
    // Pattern: /username/boardname or /username/boardname/sectionname
    if (pathParts.length >= 3) {
      // We might be in a section - check if 3rd part isn't a system route
      var thirdPart = pathParts[2];
      var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize'];
      if (systemRoutes.indexOf(thirdPart) === -1) {
        currentSection = decodeURIComponent(thirdPart).replace(/-/g, ' ');
      }
    }

    return { n: boardName, t: totalPins, section: currentSection };
  }

  // Detect sections on the board page using multiple strategies
  function detectSections() {
    boardSections = [];
    var pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return boardSections;

    var username = pathParts[0];
    var boardSlug = pathParts[1];
    var boardPath = '/' + username + '/' + boardSlug;
    var sectionMap = new Map(); // slug -> {name, pinCount}
    var systemRoutes = ['pins', 'more_ideas', 'followers', 'activity', 'settings', 'edit', 'invite', 'organize', 'organise', 'collaborators', 'invites', 'see', 'see-pins', 'see_pins', 'ideas', 'search', 'notifications', 'messages', 'create', 'board', 'pin', 'user', 'about', 'terms', 'privacy', 'help', 'contact'];

    console.log('[PA] Detecting sections for:', boardPath);

    // Strategy 1: Parse ALL script tags for BoardSection data (most reliable)
    try {
      var scripts = document.querySelectorAll('script');
      scripts.forEach(function(script) {
        var text = script.textContent || '';
        if (text.length < 100) return;

        // Look specifically for BoardSection objects with __typename marker
        // Pattern: objects with "slug" and "__typename":"BoardSection"
        var sectionPattern = /"slug"\s*:\s*"([^"]+)"[^}]*?"__typename"\s*:\s*"BoardSection"/g;
        var match;
        while ((match = sectionPattern.exec(text)) !== null) {
          var slug = match[1];
          if (!slug || systemRoutes.indexOf(slug) !== -1) continue;
          if (slug.match(/^[\d]+$/) || slug.length > 100) continue;

          // Get surrounding context to find pin_count and title
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
            console.log('[PA] Found BoardSection:', name, '(' + slug + ')', pinCount, 'pins');
          }
        }

        // Also try reverse pattern: __typename before slug
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
            console.log('[PA] Found BoardSection (reverse):', name, '(' + slug + ')', pinCount, 'pins');
          }
        }

        // Also look for board_sections or sections arrays
        if (text.indexOf('board_sections') !== -1 || text.indexOf('"sections"') !== -1) {
          var arrayPattern = /"slug"\s*:\s*"([^"]+)"[^}]*?"pin_count"\s*:\s*(\d+)/g;
          while ((match = arrayPattern.exec(text)) !== null) {
            var slug = match[1];
            var pinCount = parseInt(match[2], 10);
            if (!slug || systemRoutes.indexOf(slug) !== -1) continue;
            if (slug.match(/^[\d]+$/) || slug.length > 100) continue;
            // Only add if we found it near sections context
            var nearbyStart = Math.max(0, match.index - 1000);
            var nearbyText = text.slice(nearbyStart, match.index);
            if (nearbyText.indexOf('section') !== -1 || nearbyText.indexOf('Section') !== -1) {
              if (!sectionMap.has(slug)) {
                var name = decodeURIComponent(slug).replace(/-/g, ' ');
                sectionMap.set(slug, { name: name, pinCount: pinCount });
                console.log('[PA] Found section in array:', name, '(' + slug + ')', pinCount, 'pins');
              }
            }
          }
        }
      });
    } catch (e) {
      console.log('[PA] Script parsing error:', e);
    }

    // Strategy 2: Look for section links in the DOM (only if they have pin counts nearby)
    var allLinks = document.querySelectorAll('a[href]');
    allLinks.forEach(function(link) {
      var href = link.getAttribute('href') || '';
      if (href.indexOf(boardPath + '/') === 0) {
        var remainder = href.slice(boardPath.length + 1).split('/')[0].split('?')[0];
        if (remainder && remainder.length > 2 && remainder.length < 80) {
          if (systemRoutes.indexOf(remainder) === -1 && systemRoutes.indexOf(remainder.toLowerCase()) === -1 && !remainder.match(/^[\d]+$/)) {
            // Must have a parent container with pin count to be a valid section
            var container = link.closest('[data-test-id]') || link.parentElement?.parentElement?.parentElement;
            if (container) {
              var containerText = container.textContent || '';
              var countMatch = containerText.match(/(\d+)\s*(?:pins?|Pins?)/i);

              // Only add if we found a pin count (real sections show pin counts)
              if (countMatch) {
                var pinCount = parseInt(countMatch[1], 10);
                var name = decodeURIComponent(remainder).replace(/-/g, ' ');

                var heading = container.querySelector('h2, h3, h4, [role="heading"]');
                if (heading) {
                  var headingText = heading.textContent.trim().replace(/\d+\s*pins?/gi, '').trim();
                  if (headingText && headingText.length > 0 && headingText.length < 60) {
                    name = headingText;
                  }
                }

                if (!sectionMap.has(remainder)) {
                  sectionMap.set(remainder, { name: name, pinCount: pinCount });
                  console.log('[PA] Found section from DOM:', name, '(' + remainder + ')', pinCount, 'pins');
                }
              }
            }
          }
        }
      }
    });

    // Strategy 3: Look for section containers with data attributes
    var sectionContainers = document.querySelectorAll('[data-test-id*="section"], [data-test-id*="board-section"]');
    sectionContainers.forEach(function(container) {
      var link = container.querySelector('a[href*="/' + boardSlug + '/"]');
      if (link) {
        var href = link.getAttribute('href') || '';
        var match = href.match(new RegExp(boardPath + '/([^/?]+)'));
        if (match && match[1] && match[1].length > 2 && systemRoutes.indexOf(match[1]) === -1 && systemRoutes.indexOf(match[1].toLowerCase()) === -1) {
          var slug = match[1];
          var containerText = container.textContent || '';
          var countMatch = containerText.match(/(\d+)\s*(?:pins?|Pins?)/i);

          // Only add if we found a pin count
          if (countMatch) {
            var pinCount = parseInt(countMatch[1], 10);
            var name = decodeURIComponent(slug).replace(/-/g, ' ');

            var heading = container.querySelector('h2, h3, h4, [role="heading"]');
            if (heading) {
              var headingText = heading.textContent.trim().replace(/\d+\s*pins?/gi, '').trim();
              if (headingText && headingText.length > 0 && headingText.length < 60) {
                name = headingText;
              }
            }

            if (!sectionMap.has(slug) || sectionMap.get(slug).pinCount === 0) {
              sectionMap.set(slug, { name: name, pinCount: pinCount });
              console.log('[PA] Found section from container:', name, '(' + slug + ')', pinCount, 'pins');
            }
          }
        }
      }
    });

    // Convert map to array
    sectionMap.forEach(function(data, slug) {
      boardSections.push({
        name: data.name,
        slug: slug,
        url: boardPath + '/' + slug,
        pinCount: data.pinCount
      });
    });

    // Sort sections alphabetically
    boardSections.sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });

    console.log('[PA] Total sections found:', boardSections.length, boardSections);
    return boardSections;
  }

  // Async version that scrolls to load sections first
  async function detectSectionsAsync() {
    // First, try to detect without scrolling
    detectSections();

    // Always scroll to try to load more sections
    console.log('[PA] Scrolling to load sections...');
    var originalScroll = window.scrollY;

    // Scroll down progressively to trigger lazy loading
    for (var pos = 0; pos <= 2500; pos += 400) {
      window.scrollTo(0, pos);
      await sleep(300);
    }

    // Wait a bit for content to load
    await sleep(800);

    // Scroll back up
    window.scrollTo(0, originalScroll);
    await sleep(300);

    // Try detection again
    detectSections();

    console.log('[PA] After scrolling, found', boardSections.length, 'sections');
    return boardSections;
  }

  function esc(x) {
    var d = document.createElement('div');
    d.textContent = x;
    return d.innerHTML;
  }

  async function createUI() {
    var info = getBoardInfo();
    var overlay = document.createElement('div');
    overlay.id = 'pa-overlay';

    // Initial UI without sections (will update after async detection)
    var html = '<div class="pa-h"><h2>Pinterest Archiver</h2><button class="pa-x" id="pa-x">x</button></div>';
    html += '<div class="pa-c"><div class="pa-i"><div class="pa-n">' + esc(info.n) + '</div>';

    // Show section info if we're in a section
    if (info.section) {
      html += '<div class="pa-p" style="color:#e60023">Section: ' + esc(info.section) + '</div>';
    }

    html += '<div class="pa-p">' + info.t.toLocaleString() + ' pins</div></div>';

    // Sections panel with loading state
    html += '<div id="pa-sections-panel">';
    if (!info.section) {
      html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
      html += '<div style="font-weight:600;font-size:13px;margin-bottom:8px">Sections</div>';
      html += '<div style="color:#888;font-size:12px;padding:8px 0;text-align:center">';
      html += '<div style="display:inline-block;width:16px;height:16px;border:2px solid #ddd;border-top-color:#e60023;border-radius:50%;animation:pa-spin 1s linear infinite;margin-right:8px;vertical-align:middle"></div>';
      html += 'Loading sections...</div></div>';
    }
    html += '</div>';

    html += '<div id="pa-btns"><button class="pa-b pa-bp" data-s="0" data-e="1">Download</button>';

    if (info.t > 200) {
      html += '<div class="pa-t">By Halves</div><div class="pa-r">';
      html += '<button class="pa-b" data-s="0" data-e="0.5">First Half</button>';
      html += '<button class="pa-b" data-s="0.5" data-e="1">Second Half</button></div>';
      html += '<div class="pa-t">By Quarters</div><div class="pa-r">';
      html += '<button class="pa-b" data-s="0" data-e="0.25">Q1</button>';
      html += '<button class="pa-b" data-s="0.25" data-e="0.5">Q2</button>';
      html += '<button class="pa-b" data-s="0.5" data-e="0.75">Q3</button>';
      html += '<button class="pa-b" data-s="0.75" data-e="1">Q4</button></div>';
      html += '<div class="pa-t">By Eighths</div><div class="pa-r" style="flex-wrap:wrap">';
      for (var i = 0; i < 8; i++) {
        html += '<button class="pa-b" style="flex:0 0 calc(25% - 6px);margin-top:' + (i >= 4 ? '8px' : '0') + '" data-s="' + (i/8) + '" data-e="' + ((i+1)/8) + '">' + (i+1) + '/8</button>';
      }
      html += '</div>';
    }

    html += '</div><div class="pa-s" id="pa-s"><span id="pa-st">Starting...</span>';
    html += '<div class="pa-g"><div class="pa-gb" id="pa-gb"></div></div></div>';
    html += '<div class="pa-m" id="pa-m"></div>';
    html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee;font-size:13px;color:#666">Author: <a href="https://www.jbrandford.com" target="_blank" style="color:#e60023;text-decoration:none"><svg width="14" height="14" viewBox="0 0 14 14" style="vertical-align:-2px;margin-right:4px"><circle cx="7" cy="7" r="7" fill="#e60023"/></svg>J.Brandford</a></div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('pa-x').onclick = function() { overlay.remove(); };

    // Bind download buttons
    function bindButtons() {
      var btns = document.querySelectorAll('#pa-btns .pa-b');
      for (var k = 0; k < btns.length; k++) {
        btns[k].onclick = function(ev) {
          if (isDownloading) return;
          // Get selected sections
          var selectedSections = getSelectedSections();
          startDownload(parseFloat(ev.target.dataset.s), parseFloat(ev.target.dataset.e), selectedSections);
        };
      }
    }

    // Get selected sections from checkboxes (includes "main" if checked)
    function getSelectedSections() {
      var selected = [];
      var checkboxes = document.querySelectorAll('.pa-section-cb:checked');
      checkboxes.forEach(function(cb) {
        if (cb.dataset.main === 'true') {
          // This is the "main" checkbox - calculate main pin count
          var sectionPinTotal = boardSections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
          var mainPinCount = Math.max(0, totalPins - sectionPinTotal);
          selected.push({
            name: 'main',
            slug: null,
            url: null, // Will be constructed from current path
            pinCount: mainPinCount,
            isMain: true
          });
        } else {
          var idx = parseInt(cb.dataset.idx, 10);
          if (boardSections[idx]) {
            selected.push(boardSections[idx]);
          }
        }
      });
      return selected;
    }

    // Update sections panel
    function updateSectionsPanel(sections) {
      var panel = document.getElementById('pa-sections-panel');
      if (!panel) return;

      if (info.section) {
        // We're in a section, don't show section panel
        panel.innerHTML = '';
        return;
      }

      // Calculate main pin count (total - sections)
      var sectionPinTotal = sections.reduce(function(sum, sec) { return sum + (sec.pinCount || 0); }, 0);
      var mainPinCount = Math.max(0, info.t - sectionPinTotal);

      var html = '';

      // SECTIONS BLOCK
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
          if (sec.pinCount > 0) {
            html += '<span style="color:#888;font-size:11px;margin-left:8px">' + sec.pinCount + ' pins</span>';
          }
          html += '</label>';
        });

        html += '</div></div>';
      } else {
        // No sections found - just show scan button
        html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<span style="font-weight:600;font-size:13px;color:#888">No sections found</span>';
        html += '<button id="pa-scan-sections" style="font-size:11px;padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:#fff;cursor:pointer">Scan Again</button>';
        html += '</div></div>';
      }

      // MAIN BOARD BLOCK
      html += '<div style="margin:12px 0;padding:10px;background:#f8f8f8;border-radius:8px">';
      html += '<label style="display:flex;align-items:center;cursor:pointer;font-weight:600;font-size:13px">';
      html += '<input type="checkbox" class="pa-section-cb" data-main="true" checked style="margin-right:6px">';
      html += '<span>Main board (' + mainPinCount + ' pins)</span></label>';
      html += '</div>';

      panel.innerHTML = html;

      // Bind scan button
      var scanBtn = document.getElementById('pa-scan-sections');
      if (scanBtn) {
        scanBtn.onclick = async function() {
          scanBtn.disabled = true;
          scanBtn.textContent = 'Scanning...';
          await detectSectionsAsync();
          updateSectionsPanel(boardSections);
        };
      }

      // Bind select all sections checkbox
      var selectAllCb = document.getElementById('pa-select-all-sections');
      if (selectAllCb) {
        selectAllCb.onchange = function() {
          var sectionCheckboxes = document.querySelectorAll('.pa-section-cb[data-idx]');
          sectionCheckboxes.forEach(function(cb) {
            cb.checked = selectAllCb.checked;
          });
        };
      }
    }

    bindButtons();

    // Detect sections (async to allow scrolling if needed)
    if (!info.section) {
      var sections = await detectSectionsAsync();
      updateSectionsPanel(sections);
    }
  }

  function stat(text, progress) {
    var se = document.getElementById('pa-s');
    var st = document.getElementById('pa-st');
    var gb = document.getElementById('pa-gb');
    se.classList.add('on');
    st.textContent = text;
    if (progress != null) gb.style.width = (progress * 100) + '%';
  }

  function msg(text) {
    var m = document.getElementById('pa-m');
    m.classList.add('on');
    m.innerHTML = text;
  }

  function dis(v) {
    var b = document.querySelectorAll('#pa-btns .pa-b');
    for (var i = 0; i < b.length; i++) b[i].disabled = v;
  }

  function sleep(ms) {
    return new Promise(function(r) { setTimeout(r, ms); });
  }

  function getOriginalUrl(url) {
    if (!url || url.indexOf('pinimg.com') === -1) return null;
    // Clean up escaped URLs
    url = url.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
    return url.replace(/\/\d+x\d*\//, '/originals/');
  }

  function isValidPinImage(url) {
    if (!url || url.indexOf('pinimg.com') === -1) return false;
    if (url.indexOf('/avatars/') !== -1) return false;
    if (/\/(75x75|60x60|50x50|30x30|140x140)(_RS)?\//.test(url)) return false;
    return true;
  }

  async function scrollAndCollect(sectionLabel, targetWin) {
    // targetWin allows us to collect from a different window (for sections opened in new tabs)
    var win = targetWin || window;
    var doc = win.document;

    return new Promise(async function(done) {
      var lastCount = 0, sameCount = 0;
      var maxScrollAttempts = 300;
      var scrollAttempt = 0;
      var targetPins = totalPins || 100;
      var label = sectionLabel ? ('section "' + sectionLabel + '"') : 'main board';

      stat('Scanning ' + label + ' for pins...', 0);

      // Use a local map for this collection
      var localPinData = new Map();

      // Local version of collectPins that works on any document
      function collectPinsFromDoc() {
        var pinLinks = doc.querySelectorAll('a[href*="/pin/"]');

        pinLinks.forEach(function(link) {
          var match = link.href.match(/\/pin\/(\d+)/);
          if (!match) return;

          var pinId = match[1];
          if (localPinData.has(pinId) && localPinData.get(pinId)) return;

          var container = link.closest('[data-test-id="pin"]') ||
                          link.closest('[data-test-id="pinWrapper"]') ||
                          link.closest('[data-grid-item="true"]') ||
                          link.closest('[role="listitem"]') ||
                          link.parentElement?.parentElement?.parentElement;

          if (!container) return;
          if (container.closest('header, nav, [data-test-id="header"]')) return;

          var imageUrl = extractImageFromContainerDoc(container);

          if (imageUrl) {
            localPinData.set(pinId, imageUrl);
          } else if (!localPinData.has(pinId)) {
            localPinData.set(pinId, null);
          }
        });
      }

      // Local version of extractImageFromContainer
      function extractImageFromContainerDoc(container) {
        var img = container.querySelector('img[src*="pinimg.com"]');
        if (img && isValidPinImage(img.src)) {
          return getOriginalUrl(img.src);
        }

        var imgWithSrcset = container.querySelector('img[srcset*="pinimg.com"]');
        if (imgWithSrcset) {
          var srcset = imgWithSrcset.srcset || '';
          var match = srcset.match(/https?:\/\/[^\s,]+pinimg\.com[^\s,]+/);
          if (match && isValidPinImage(match[0])) {
            return getOriginalUrl(match[0]);
          }
        }

        var lazyImg = container.querySelector('img[data-src*="pinimg.com"]');
        if (lazyImg) {
          var dataSrc = lazyImg.getAttribute('data-src');
          if (isValidPinImage(dataSrc)) {
            return getOriginalUrl(dataSrc);
          }
        }

        var video = container.querySelector('video[poster*="pinimg.com"]');
        if (video && isValidPinImage(video.poster)) {
          return getOriginalUrl(video.poster);
        }

        var allEls = container.querySelectorAll('*');
        for (var i = 0; i < allEls.length; i++) {
          var el = allEls[i];
          var style = el.getAttribute('style') || '';
          if (style.indexOf('pinimg') !== -1) {
            var bgMatch = style.match(/url\(["']?(https?:\/\/[^"')]+pinimg[^"')]+)/i);
            if (bgMatch && isValidPinImage(bgMatch[1])) {
              return getOriginalUrl(bgMatch[1]);
            }
          }
        }

        return null;
      }

      async function step() {
        scrollAttempt++;
        if (scrollAttempt > maxScrollAttempts) {
          finalize();
          return;
        }

        // Collect pins at current scroll position
        collectPinsFromDoc();

        // Count pins with images
        var withImages = 0;
        localPinData.forEach(function(url) { if (url) withImages++; });

        var progress = targetPins > 0 ? withImages / targetPins : 0;
        stat(label + ': ' + withImages + ' of ' + targetPins + ' pins...', Math.min(progress, 1));

        // Check if we have all pins with images
        if (withImages >= targetPins) {
          await sleep(500);
          collectPinsFromDoc();
          finalize();
          return;
        }

        if (withImages === lastCount) {
          sameCount++;
          if (sameCount > 12) {
            if (scrollAttempt < maxScrollAttempts - 50) {
              stat('Re-scanning ' + label + '...', progress);
              win.scrollTo(0, 0);
              await sleep(1000);
              sameCount = 0;
            } else {
              finalize();
              return;
            }
          }
        } else {
          sameCount = 0;
          lastCount = withImages;
        }

        // Scroll down slowly
        win.scrollBy(0, win.innerHeight * 0.4);
        await sleep(800);

        // Trigger scroll events
        win.dispatchEvent(new Event('scroll'));
        win.dispatchEvent(new Event('scrollend'));
        await sleep(400);

        // At bottom of page?
        if ((win.innerHeight + win.scrollY) >= (doc.body.offsetHeight - 300)) {
          await sleep(1500);
          collectPinsFromDoc();

          var newWithImages = 0;
          localPinData.forEach(function(url) { if (url) newWithImages++; });

          if (newWithImages === withImages && sameCount > 5) {
            finalize();
            return;
          }
        }

        step();
      }

      function finalize() {
        collectPinsFromDoc();

        var urls = [];
        localPinData.forEach(function(url) {
          if (url) urls.push(url);
        });

        done(urls);
      }

      // Start at top
      win.scrollTo(0, 0);
      await sleep(1000);

      // Initial scan
      collectPinsFromDoc();
      var initial = 0;
      localPinData.forEach(function(url) { if (url) initial++; });
      stat(label + ' initial: ' + initial + ' pins found. Scrolling...', 0);
      await sleep(500);

      step();
    });
  }

  // Collect pins from a section by opening it in a new tab
  async function collectFromSectionTab(sectionUrl, sectionName) {
    return new Promise(async function(resolve) {
      stat('Opening section "' + sectionName + '" in new tab...', 0);

      // Open section in new window/tab
      var sectionWin = window.open(sectionUrl, '_blank');

      if (!sectionWin) {
        msg('<b>Popup blocked!</b> Please allow popups for Pinterest and try again.');
        resolve([]);
        return;
      }

      // Wait for page to load
      stat('Waiting for "' + sectionName + '" to load...', 0);
      await sleep(4000);

      // Check if window is still open and accessible
      try {
        // Try to access the document to verify same-origin access
        var testAccess = sectionWin.document.body;
        if (!testAccess) throw new Error('No access');
      } catch (e) {
        msg('<b>Cannot access section tab.</b> It may have been blocked or closed.');
        try { sectionWin.close(); } catch (e2) {}
        resolve([]);
        return;
      }

      // Get pin count for this section if available
      var sectionPinCount = 100;
      try {
        var pc = sectionWin.document.querySelector('[data-test-id="pin-count"]');
        if (pc) {
          var m = pc.textContent.match(/[\d,]+/);
          if (m) sectionPinCount = parseInt(m[0].replace(/,/g, ''), 10);
        }
      } catch (e) {}

      // Temporarily update totalPins for the collection
      var savedTotalPins = totalPins;
      totalPins = sectionPinCount;

      // Collect pins from the section window
      var urls = await scrollAndCollect(sectionName, sectionWin);

      // Restore totalPins
      totalPins = savedTotalPins;

      // Close the section window
      try {
        sectionWin.close();
      } catch (e) {}

      stat('Collected ' + urls.length + ' pins from "' + sectionName + '"', 1);
      await sleep(500);

      resolve(urls);
    });
  }

  async function fetchImage(url) {
    try {
      var response = await fetch(url);
      if (!response.ok) throw new Error('Failed');
      return await response.arrayBuffer();
    } catch (e) {
      // Try fallback resolution
      try {
        var fallbackUrl = url.replace('/originals/', '/736x/');
        var response2 = await fetch(fallbackUrl);
        if (!response2.ok) throw new Error('Failed');
        return await response2.arrayBuffer();
      } catch (e2) {
        return null;
      }
    }
  }

  // Load a section in an iframe and collect pins from it
  // Returns {urls: string[], pinIds: Set} so we can track which pins are in sections
  async function collectFromSectionIframeWithIds(sectionUrl, sectionName, expectedPinCount) {
    return new Promise(async function(resolve) {
      console.log('[PA] Loading section in iframe:', sectionName, sectionUrl);
      stat('Loading "' + sectionName + '"...', 0);

      // Create hidden iframe
      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0;pointer-events:none;z-index:-1';
      iframe.src = sectionUrl;
      document.body.appendChild(iframe);

      // Wait for iframe to load
      var loaded = false;
      iframe.onload = function() { loaded = true; };

      // Wait for load event or timeout
      var waitAttempts = 0;
      while (!loaded && waitAttempts < 20) {
        await sleep(500);
        waitAttempts++;
      }

      if (!loaded) {
        console.log('[PA] Iframe load timeout for:', sectionName);
        iframe.remove();
        resolve({ urls: [], pinIds: new Set() });
        return;
      }

      // Wait extra for content to render
      await sleep(2000);

      // Try to access iframe content
      var iframeDoc;
      try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      } catch (e) {
        console.log('[PA] Cannot access iframe (cross-origin):', e);
        iframe.remove();
        resolve({ urls: [], pinIds: new Set() });
        return;
      }

      // Collect pins from iframe by scrolling within it
      var pinData = new Map(); // pinId -> url
      var iframeWin = iframe.contentWindow;
      var targetPins = expectedPinCount || 50;

      // Hide content to reduce browser load while scrolling (display:none for performance)
      console.log('[PA] Using optimized scroll for', targetPins, 'pins');
      var hiddenContainer = iframeDoc.querySelector('[data-test-id="pinGrid"]') ||
                            iframeDoc.querySelector('[data-test-id="board-feed"]') ||
                            iframeDoc.querySelector('main') ||
                            iframeDoc.querySelector('[role="main"]');
      if (hiddenContainer) {
        hiddenContainer.style.display = 'none';
      }

      stat('Scanning "' + sectionName + '"...', 0);

      // Scroll and collect function for iframe - extracts URLs from script data
      async function collectFromIframe() {
        // Method 1: Collect from DOM pin links
        var pinLinks = iframeDoc.querySelectorAll('a[href*="/pin/"]');
        pinLinks.forEach(function(link) {
          var match = link.href.match(/\/pin\/(\d+)/);
          if (!match) return;
          var pinId = match[1];
          if (pinData.has(pinId) && pinData.get(pinId)) return;

          var container = link.closest('[data-test-id="pin"]') ||
                          link.closest('[data-test-id="pinWrapper"]') ||
                          link.closest('[data-grid-item="true"]') ||
                          link.closest('[role="listitem"]') ||
                          link.parentElement?.parentElement?.parentElement;

          if (!container) return;

          var img = container.querySelector('img[src*="pinimg.com"]');
          if (img && isValidPinImage(img.src)) {
            pinData.set(pinId, getOriginalUrl(img.src));
          }
        });

        // Method 2: Parse script tags for pin data (works even with display:none)
        var scripts = iframeDoc.querySelectorAll('script');
        scripts.forEach(function(script) {
          var text = script.textContent || '';
          if (text.length < 100 || text.indexOf('pinimg.com') === -1) return;

          // Find pin IDs with their image URLs
          var pinPattern = /"id"\s*:\s*"(\d+)"[^}]*?"images"[^}]*?"orig"[^}]*?"url"\s*:\s*"([^"]+pinimg[^"]+)"/g;
          var match;
          while ((match = pinPattern.exec(text)) !== null) {
            var pinId = match[1];
            var url = match[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (!pinData.has(pinId) && isValidPinImage(url)) {
              pinData.set(pinId, getOriginalUrl(url));
            }
          }

          // Alternative pattern
          var altPattern = /"pinId"\s*:\s*"?(\d+)"?[^}]*?"originUrl"\s*:\s*"([^"]+pinimg[^"]+)"/g;
          while ((match = altPattern.exec(text)) !== null) {
            var pinId = match[1];
            var url = match[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (!pinData.has(pinId) && isValidPinImage(url)) {
              pinData.set(pinId, getOriginalUrl(url));
            }
          }
        });
      }

      // Initial collection
      collectFromIframe();

      // Fast scroll settings (content is hidden so no rendering overhead)
      var scrollIncrement = iframeWin.innerHeight * 2;
      var scrollDelay = 300;
      var maxScrolls = 150;
      var maxSameCount = 15;

      // Scroll within iframe to load more
      var lastCount = 0;
      var sameCount = 0;
      for (var scroll = 0; scroll < maxScrolls; scroll++) {
        iframeWin.scrollBy(0, scrollIncrement);
        await sleep(scrollDelay);
        collectFromIframe();

        var currentCount = pinData.size;
        stat('"' + sectionName + '": ' + currentCount + '/' + targetPins + ' pins', currentCount / targetPins);

        if (currentCount >= targetPins) break;
        if (currentCount === lastCount) {
          sameCount++;
          if (sameCount > maxSameCount) break;
        } else {
          sameCount = 0;
          lastCount = currentCount;
        }
      }

      // Restore display
      if (hiddenContainer) {
        hiddenContainer.style.display = '';
      }

      // Extract URLs and pin IDs
      var urls = [];
      var pinIds = new Set();
      pinData.forEach(function(url, pinId) {
        if (url) {
          urls.push(url);
          pinIds.add(pinId);
        }
      });

      console.log('[PA] Collected', urls.length, 'pins from section:', sectionName);

      // Cleanup
      iframe.remove();
      resolve({ urls: urls, pinIds: pinIds });
    });
  }

  // Collect main board pins (not in sections) using iframe
  async function collectMainBoardPins(boardUrl, sectionPinIds, expectedTotal) {
    return new Promise(async function(resolve) {
      console.log('[PA] Loading main board in iframe:', boardUrl);
      stat('Loading main board...', 0);

      var iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0;pointer-events:none;z-index:-1';
      iframe.src = boardUrl;
      document.body.appendChild(iframe);

      var loaded = false;
      iframe.onload = function() { loaded = true; };

      var waitAttempts = 0;
      while (!loaded && waitAttempts < 20) {
        await sleep(500);
        waitAttempts++;
      }

      if (!loaded) {
        console.log('[PA] Iframe load timeout for main board');
        iframe.remove();
        resolve([]);
        return;
      }

      await sleep(2000);

      var iframeDoc;
      try {
        iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      } catch (e) {
        console.log('[PA] Cannot access main board iframe:', e);
        iframe.remove();
        resolve([]);
        return;
      }

      var pinData = new Map(); // pinId -> url
      var iframeWin = iframe.contentWindow;
      var targetPins = expectedTotal || 100;

      // Hide content to reduce browser load while scrolling (display:none for performance)
      console.log('[PA] Using optimized scroll for main board,', targetPins, 'pins');
      var hiddenContainer = iframeDoc.querySelector('[data-test-id="pinGrid"]') ||
                            iframeDoc.querySelector('[data-test-id="board-feed"]') ||
                            iframeDoc.querySelector('main') ||
                            iframeDoc.querySelector('[role="main"]');
      if (hiddenContainer) {
        hiddenContainer.style.display = 'none';
      }

      stat('Scanning main board...', 0);

      async function collectFromIframe() {
        // Method 1: Collect from DOM pin links
        var pinLinks = iframeDoc.querySelectorAll('a[href*="/pin/"]');
        pinLinks.forEach(function(link) {
          var match = link.href.match(/\/pin\/(\d+)/);
          if (!match) return;
          var pinId = match[1];

          // Skip if already in a section
          if (sectionPinIds.has(pinId)) return;
          if (pinData.has(pinId) && pinData.get(pinId)) return;

          var container = link.closest('[data-test-id="pin"]') ||
                          link.closest('[data-test-id="pinWrapper"]') ||
                          link.closest('[data-grid-item="true"]') ||
                          link.closest('[role="listitem"]') ||
                          link.parentElement?.parentElement?.parentElement;

          if (!container) return;

          var img = container.querySelector('img[src*="pinimg.com"]');
          if (img && isValidPinImage(img.src)) {
            pinData.set(pinId, getOriginalUrl(img.src));
          }
        });

        // Method 2: Parse script tags for pin data (works even with display:none)
        var scripts = iframeDoc.querySelectorAll('script');
        scripts.forEach(function(script) {
          var text = script.textContent || '';
          if (text.length < 100 || text.indexOf('pinimg.com') === -1) return;

          // Find pin IDs with their image URLs
          var pinPattern = /"id"\s*:\s*"(\d+)"[^}]*?"images"[^}]*?"orig"[^}]*?"url"\s*:\s*"([^"]+pinimg[^"]+)"/g;
          var match;
          while ((match = pinPattern.exec(text)) !== null) {
            var pinId = match[1];
            if (sectionPinIds.has(pinId)) continue; // Skip section pins
            var url = match[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (!pinData.has(pinId) && isValidPinImage(url)) {
              pinData.set(pinId, getOriginalUrl(url));
            }
          }

          // Alternative pattern
          var altPattern = /"pinId"\s*:\s*"?(\d+)"?[^}]*?"originUrl"\s*:\s*"([^"]+pinimg[^"]+)"/g;
          while ((match = altPattern.exec(text)) !== null) {
            var pinId = match[1];
            if (sectionPinIds.has(pinId)) continue; // Skip section pins
            var url = match[2].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (!pinData.has(pinId) && isValidPinImage(url)) {
              pinData.set(pinId, getOriginalUrl(url));
            }
          }
        });
      }

      collectFromIframe();

      // Fast scroll settings (content is hidden so no rendering overhead)
      var scrollIncrement = iframeWin.innerHeight * 2;
      var scrollDelay = 300;
      var maxScrolls = 150;
      var maxSameCount = 15;

      var lastCount = 0;
      var sameCount = 0;
      for (var scroll = 0; scroll < maxScrolls; scroll++) {
        iframeWin.scrollBy(0, scrollIncrement);
        await sleep(scrollDelay);
        collectFromIframe();

        var currentCount = pinData.size;
        stat('"main": ' + currentCount + ' pins (excluding sections)', currentCount / targetPins);

        if (currentCount >= targetPins) break;
        if (currentCount === lastCount) {
          sameCount++;
          if (sameCount > maxSameCount) break;
        } else {
          sameCount = 0;
          lastCount = currentCount;
        }
      }

      // Restore display
      if (hiddenContainer) {
        hiddenContainer.style.display = '';
      }

      var urls = [];
      pinData.forEach(function(url) { if (url) urls.push(url); });

      console.log('[PA] Collected', urls.length, 'main board pins (excluding section pins)');

      iframe.remove();
      resolve(urls);
    });
  }

  async function startDownload(startPct, endPct, selectedSections) {
    isDownloading = true;
    dis(true);

    var allSelected = selectedSections || [];

    // Separate regular sections from "main"
    var regularSections = allSelected.filter(function(s) { return !s.isMain; });
    var includeMain = allSelected.some(function(s) { return s.isMain; });
    var sectionPinIds = new Set(); // Track pin IDs from sections to exclude from main

    try {
      var safeName = boardName.replace(/[^a-zA-Z0-9]/g, '_');
      var allCollected = []; // Array of {section: string, urls: string[]}

      // RULE 2: Handle sections FIRST - they are the problematic area
      if (regularSections.length > 0) {
        msg('<b>Collecting from ' + regularSections.length + ' section(s)...</b>');

        for (var si = 0; si < regularSections.length; si++) {
          var section = regularSections[si];
          var sectionUrl = 'https://www.pinterest.com' + section.url;

          stat('Section ' + (si + 1) + '/' + regularSections.length + ': ' + section.name, si / regularSections.length);

          // RULE 3: Collect ONLY pins from this section (via iframe)
          var sectionResult = await collectFromSectionIframeWithIds(sectionUrl, section.name, section.pinCount);

          if (sectionResult.urls.length > 0) {
            // Track these pin IDs so we exclude them from main
            sectionResult.pinIds.forEach(function(id) { sectionPinIds.add(id); });

            var sectionStartIdx = Math.floor(sectionResult.urls.length * startPct);
            var sectionEndIdx = Math.floor(sectionResult.urls.length * endPct);
            var slicedSectionUrls = sectionResult.urls.slice(sectionStartIdx, sectionEndIdx);

            allCollected.push({
              section: section.name,
              urls: slicedSectionUrls
            });
          }

          await sleep(300);
        }
      }

      // Collect MAIN board pins only if "main" was selected
      if (includeMain) {
        var pathParts = location.pathname.split('/').filter(Boolean);
        if (pathParts.length >= 2) {
          var mainBoardUrl = 'https://www.pinterest.com/' + pathParts[0] + '/' + pathParts[1];

          stat('Collecting main board pins...', 0);
          msg('<b>Collecting main board pins...</b> (excluding section pins)');

          var mainUrls = await collectMainBoardPins(mainBoardUrl, sectionPinIds, totalPins);

          if (mainUrls.length > 0) {
            var mainStartIdx = Math.floor(mainUrls.length * startPct);
            var mainEndIdx = Math.floor(mainUrls.length * endPct);
            var slicedMainUrls = mainUrls.slice(mainStartIdx, mainEndIdx);

            allCollected.push({
              section: 'Main',
              urls: slicedMainUrls
            });

            console.log('[PA] Added', slicedMainUrls.length, 'main board pins');
          }
        }
      }

      // Count total pins to download
      var totalToDownload = allCollected.reduce(function(sum, c) { return sum + c.urls.length; }, 0);

      if (totalToDownload === 0) {
        stat('No pins found', 0);
        msg('<b>No pins found.</b> The iframe method may be blocked. Try using the bookmarklet directly on each section page.');
        isDownloading = false;
        dis(false);
        return;
      }

      stat('Downloading ' + totalToDownload + ' images...', 0);
      msg('<b>Fetching ' + totalToDownload + ' images...</b>');

      var files = [];
      var success = 0, failed = 0;
      var globalIndex = 0;

      // Check if we're only downloading main board (no sections)
      var mainOnly = allCollected.length === 1 && allCollected[0].section === 'Main';

      for (var ci = 0; ci < allCollected.length; ci++) {
        var collection = allCollected[ci];
        var folderPath;
        if (mainOnly) {
          // No sections - save directly to board folder
          folderPath = safeName + '/';
        } else {
          // Has sections - use subfolder
          var safeSectionName = collection.section.replace(/[^a-zA-Z0-9]/g, '_');
          folderPath = safeName + '/' + safeSectionName + '/';
        }

        for (var ui = 0; ui < collection.urls.length; ui++) {
          globalIndex++;
          var filename = folderPath + String(ui + 1).padStart(4, '0') + '.jpg';
          stat('Fetching ' + globalIndex + '/' + totalToDownload, globalIndex / totalToDownload);

          var data = await fetchImage(collection.urls[ui]);
          if (data) {
            files.push({
              name: filename,
              data: data,
              crc: crc32(new Uint8Array(data))
            });
            success++;
          } else {
            failed++;
          }

          if (globalIndex % 5 === 0) await sleep(50);
        }
      }

      stat('Creating zip...', 1);
      await sleep(100);

      var zipData = createZip(files);
      var blob = new Blob([zipData], { type: 'application/zip' });
      var downloadUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = downloadUrl;
      a.download = safeName + '_pins.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      var summary = success + ' images';
      if (failed > 0) summary += ' (' + failed + ' failed)';
      summary += '<br><b>Sections:</b> ';
      allCollected.forEach(function(c, idx) {
        if (idx > 0) summary += ', ';
        summary += c.section + ' (' + c.urls.length + ')';
      });

      stat('Done! ' + success + ' images', 1);
      msg('<b>Complete!</b><br>' + summary);

    } catch (err) {
      stat('Error: ' + err.message, 0);
      console.error('[PA] Download error:', err);
    }

    isDownloading = false;
    dis(false);
  }

  createUI();
})();
