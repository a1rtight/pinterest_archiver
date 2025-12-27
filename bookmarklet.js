// Pinterest Archiver Bookmarklet
// Downloads pin images into a single zip file

(function() {
  var e = document.getElementById('pa-overlay');
  if (e) { e.remove(); return; }

  var totalPins = 0;
  var boardName = '';
  var isDownloading = false;

  var s = document.createElement('style');
  s.textContent = '#pa-overlay{position:fixed;top:20px;right:20px;width:340px;background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.2);z-index:999999;font-family:system-ui,sans-serif;color:#333;max-height:90vh;overflow:auto}#pa-overlay *{box-sizing:border-box}.pa-h{padding:16px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#fff}.pa-h h2{margin:0;font-size:16px}.pa-x{background:none;border:none;font-size:20px;cursor:pointer;color:#666}.pa-c{padding:16px}.pa-i{margin-bottom:16px}.pa-n{font-size:18px;font-weight:600;margin-bottom:4px}.pa-p{font-size:14px;color:#666}.pa-t{font-size:12px;color:#888;margin:12px 0 8px;text-transform:uppercase}.pa-b{display:block;width:100%;padding:12px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:14px;cursor:pointer}.pa-b:hover{background:#f5f5f5}.pa-b:disabled{opacity:.5}.pa-bp{background:#e60023;color:#fff;border-color:#e60023}.pa-bp:hover{background:#ad081b}.pa-r{display:flex;gap:8px}.pa-r .pa-b{flex:1;margin:0}.pa-s{padding:12px;background:#f8f8f8;border-radius:8px;font-size:13px;color:#666;margin-top:12px;display:none}.pa-s.on{display:block}.pa-g{height:4px;background:#eee;border-radius:2px;margin-top:8px}.pa-gb{height:100%;background:#e60023;width:0;transition:width .3s}.pa-m{background:#fff3cd;padding:10px;border-radius:8px;font-size:12px;margin-top:12px;display:none}.pa-m.on{display:block}';
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
    return { n: boardName, t: totalPins };
  }

  function esc(x) {
    var d = document.createElement('div');
    d.textContent = x;
    return d.innerHTML;
  }

  function createUI() {
    var info = getBoardInfo();
    var overlay = document.createElement('div');
    overlay.id = 'pa-overlay';

    var html = '<div class="pa-h"><h2>Pinterest Archiver</h2><button class="pa-x" id="pa-x">x</button></div>';
    html += '<div class="pa-c"><div class="pa-i"><div class="pa-n">' + esc(info.n) + '</div>';
    html += '<div class="pa-p">' + info.t.toLocaleString() + ' pins</div></div>';
    html += '<div id="pa-btns"><button class="pa-b pa-bp" data-s="0" data-e="1">Download All</button>';

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
    html += '<div class="pa-m" id="pa-m"></div></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('pa-x').onclick = function() { overlay.remove(); };

    var btns = document.querySelectorAll('#pa-btns .pa-b');
    for (var k = 0; k < btns.length; k++) {
      btns[k].onclick = function(ev) {
        if (isDownloading) return;
        startDownload(parseFloat(ev.target.dataset.s), parseFloat(ev.target.dataset.e));
      };
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

  // Track pins by their unique ID - Map<pinId, imageUrl>
  var pinData = new Map();

  function isValidPinImage(url) {
    if (!url || url.indexOf('pinimg.com') === -1) return false;
    if (url.indexOf('/avatars/') !== -1) return false;
    if (/\/(75x75|60x60|50x50|30x30|140x140)(_RS)?\//.test(url)) return false;
    return true;
  }

  function extractImageFromContainer(container) {
    // Try multiple sources for the image
    var img = container.querySelector('img[src*="pinimg.com"]');
    if (img && isValidPinImage(img.src)) {
      return getOriginalUrl(img.src);
    }

    // Try srcset
    var imgWithSrcset = container.querySelector('img[srcset*="pinimg.com"]');
    if (imgWithSrcset) {
      var srcset = imgWithSrcset.srcset || '';
      var match = srcset.match(/https?:\/\/[^\s,]+pinimg\.com[^\s,]+/);
      if (match && isValidPinImage(match[0])) {
        return getOriginalUrl(match[0]);
      }
    }

    // Try data-src
    var lazyImg = container.querySelector('img[data-src*="pinimg.com"]');
    if (lazyImg) {
      var dataSrc = lazyImg.getAttribute('data-src');
      if (isValidPinImage(dataSrc)) {
        return getOriginalUrl(dataSrc);
      }
    }

    // Try video poster
    var video = container.querySelector('video[poster*="pinimg.com"]');
    if (video && isValidPinImage(video.poster)) {
      return getOriginalUrl(video.poster);
    }

    // Try background image
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

  // Scan page and collect all pins by their unique ID
  function collectPins() {
    // Find all pin links on the page
    var pinLinks = document.querySelectorAll('a[href*="/pin/"]');

    pinLinks.forEach(function(link) {
      // Extract pin ID from href
      var match = link.href.match(/\/pin\/(\d+)/);
      if (!match) return;

      var pinId = match[1];

      // Skip if we already have this pin with an image
      if (pinData.has(pinId) && pinData.get(pinId)) return;

      // Find the pin container (walk up the DOM)
      var container = link.closest('[data-test-id="pin"]') ||
                      link.closest('[data-test-id="pinWrapper"]') ||
                      link.closest('[data-grid-item="true"]') ||
                      link.closest('[role="listitem"]') ||
                      link.parentElement?.parentElement?.parentElement;

      if (!container) return;

      // Skip if this is in header/nav (not a board pin)
      if (container.closest('header, nav, [data-test-id="header"]')) return;

      // Try to get the image URL
      var imageUrl = extractImageFromContainer(container);

      if (imageUrl) {
        pinData.set(pinId, imageUrl);
      } else if (!pinData.has(pinId)) {
        // Mark this pin as found but image not yet loaded
        pinData.set(pinId, null);
      }
    });

    return pinData;
  }

  async function scrollAndCollect() {
    return new Promise(async function(done) {
      var lastCount = 0, sameCount = 0;
      var maxScrollAttempts = 300;
      var scrollAttempt = 0;
      var targetPins = totalPins || 100;

      stat('Scanning for pins...', 0);

      // Clear previous data
      pinData.clear();

      async function step() {
        scrollAttempt++;
        if (scrollAttempt > maxScrollAttempts) {
          finalize();
          return;
        }

        // Collect pins at current scroll position
        collectPins();

        // Count pins with images
        var withImages = 0;
        pinData.forEach(function(url) { if (url) withImages++; });

        var progress = targetPins > 0 ? withImages / targetPins : 0;
        stat('Found ' + withImages + ' of ' + targetPins + ' pins (IDs: ' + pinData.size + ')...', Math.min(progress, 1));

        // Check if we have all pins with images
        if (withImages >= targetPins) {
          // We have enough! Do one final pass to make sure
          await sleep(500);
          collectPins();
          finalize();
          return;
        }

        if (withImages === lastCount) {
          sameCount++;
          if (sameCount > 12) {
            // Stuck - try scrolling back up and down once more
            if (scrollAttempt < maxScrollAttempts - 50) {
              stat('Re-scanning...', progress);
              scrollTo(0, 0);
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
        window.scrollBy(0, innerHeight * 0.4);
        await sleep(800);

        // Trigger scroll events
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('scrollend'));
        await sleep(400);

        // At bottom of page?
        if ((innerHeight + scrollY) >= (document.body.offsetHeight - 300)) {
          // Wait for more content
          await sleep(1500);
          collectPins();

          var newWithImages = 0;
          pinData.forEach(function(url) { if (url) newWithImages++; });

          if (newWithImages === withImages && sameCount > 5) {
            // Nothing new, we're done
            finalize();
            return;
          }
        }

        step();
      }

      function finalize() {
        // Final collection
        collectPins();

        // For pins without images, try one more time
        var missingImages = [];
        pinData.forEach(function(url, pinId) {
          if (!url) missingImages.push(pinId);
        });

        if (missingImages.length > 0) {
          stat('Looking for ' + missingImages.length + ' missing images...', 0.9);
        }

        // Collect all image URLs
        var urls = [];
        pinData.forEach(function(url) {
          if (url) urls.push(url);
        });

        done(urls);
      }

      // Start at top
      scrollTo(0, 0);
      await sleep(1000);

      // Initial scan
      collectPins();
      var initial = 0;
      pinData.forEach(function(url) { if (url) initial++; });
      stat('Initial: ' + initial + ' pins, ' + pinData.size + ' IDs found. Scrolling...', 0);
      await sleep(500);

      step();
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

  async function startDownload(startPct, endPct) {
    isDownloading = true;
    dis(true);

    try {
      var allUrls = await scrollAndCollect();
      var startIdx = Math.floor(allUrls.length * startPct);
      var endIdx = Math.floor(allUrls.length * endPct);
      var urls = allUrls.slice(startIdx, endIdx);

      stat('Downloading ' + urls.length + ' images...', 0);
      msg('<b>Fetching images...</b> This may take a moment.');

      var files = [];
      var success = 0, failed = 0;
      var safeName = boardName.replace(/[^a-zA-Z0-9]/g, '_');

      for (var i = 0; i < urls.length; i++) {
        var filename = safeName + '_' + String(i + 1).padStart(4, '0') + '.jpg';
        stat('Fetching ' + (i + 1) + ' of ' + urls.length + '...', (i + 1) / urls.length);

        var data = await fetchImage(urls[i]);
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

        // Small delay to avoid overwhelming the server
        if (i % 5 === 0) await sleep(50);
      }

      stat('Creating zip file...', 1);
      await sleep(100);

      var zipData = createZip(files);
      var blob = new Blob([zipData], { type: 'application/zip' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = safeName + '_pins.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      stat('Done! ' + success + ' images in zip' + (failed > 0 ? ' (' + failed + ' failed)' : ''), 1);
      msg('<b>Complete!</b> Check your Downloads folder for <code>' + safeName + '_pins.zip</code>');

    } catch (err) {
      stat('Error: ' + err.message, 0);
      console.error(err);
    }

    isDownloading = false;
    dis(false);
  }

  createUI();
})();
