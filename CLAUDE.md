# Pinterest Archiver - System Documentation

## Core Rules

1. **One-click downloading** - The download solution should be one click, or if not possible, as simple as possible
2. **Sections first** - Handle sections first as they are the problematic area
3. **Section accuracy** - Each section should contain only the pins within that section of the board, no more, no less
4. **Duplicates** - There must be no duplicates when donwloading, each board and section should have the exact number of pins they contain on the website
5. **Ordering** - Pins downloaded must be in the axact order in which they appear on the board / section.
5. **Efficiency** - The downloader should be as efficeint as physically possible, both when scanning the bards for pins and downloading them - think reducing browser bloat by deleting downloaded pins from the dom and downlaoding multriple images in parralel to reduce download time.
5. **The script itself** - The script should be as simple and lightweight as humanly possible. Running the script on a new board should remove all cacheing of previous boards - i.e. no indication of a previous download's progress when applied to a new board.

## Method
1. **Pin capture** - Only pins on boards / sections made by the user should be downloaded - this excludes pinterest own suggested ideas etc. This is incredibly important.

2. **Pin capping** - Run a hard cap on each board or section ensuring the amount of pins is not surpassed, so if a board has 136 pins, the download should have exactly 136 pins.

## Recommendation Filtering (v14.0 - GRID CONTAINER APPROACH)

Pinterest uses **identical DOM markup** for board pins and recommendation pins - there's no `data-test-id`, class, or attribute that distinguishes them.

### Previous Approaches (Deprecated)
- ❌ **Hard cap with 15% buffer** - Too aggressive, sometimes stopped early
- ❌ **Text-based heading detection** - False positives on board titles
- ❌ **First-pin grid detection** - Failed on boards with many sections (detected sections grid, not pins grid)

### Working Solution: Grid Container Filtering (PRIMARY)

The key insight: **Board pins and recommendation pins live in different DOM containers**. Board pins are siblings within a grid container, while recommendations are in a separate container below.

#### How It Works

1. **Find the Grid Container**: Walk up from pin elements to find parent containers with 3+ pins.

2. **Handle Boards with Sections**: When a board has sections, the page has TWO grids:
   - First grid: Section thumbnails (not actual pins)
   - Second grid: Main board pins

   We scan all containers and only count those with actual `/pin/` links to find the PINS grid.

3. **Delayed Caching**: If we find fewer than 10 pins in the grid (Pinterest lazy-loading not complete), we DON'T cache - re-detect on next scan until more pins load.

4. **Filter by Container Membership**: Only collect pins that are descendants of the cached grid container.

```javascript
// For boards WITH sections - find the pins grid, not sections grid
if (isMainDoc && boardSections.length > 0) {
  var allPins = doc.querySelectorAll('[data-test-id="pin"], [data-grid-item="true"]');
  var gridsWithPins = new Map();

  allPins.forEach(function(pinContainer) {
    // Only count containers with actual pin links (not section thumbnails)
    var pinLink = pinContainer.querySelector('a[href*="/pin/"]');
    if (!pinLink) return;

    var grid = findGridContainer(pinContainer, doc);
    if (grid) {
      gridsWithPins.set(grid, (gridsWithPins.get(grid) || 0) + 1);
    }
  });

  // Find grid with most actual pins
  gridsWithPins.forEach(function(count, grid) {
    if (count > bestCount) {
      bestCount = count;
      gridContainer = grid;
    }
  });

  // Only cache if enough pins loaded (handles lazy-loading)
  if (bestCount < 10) {
    return gridContainer; // Return but don't cache - re-detect next scan
  }
}
```

#### In `scanForNewPins()`:
```javascript
// PRIMARY CHECK: Is this pin within the board's grid container?
if (!isInBoardGrid(container)) {
  container.dataset.paSkipped = 'outside-grid';
  return;
}
```

### H1/H2 Detection (SECONDARY - Post-Grid Only)

As a backup, we still detect recommendation section headings, but with important safeguards:

1. **Only triggers AFTER the grid container** - Uses `compareDocumentPosition()` to ensure heading comes after the grid in DOM order
2. **Ignores headings near page top** - Skips any h1/h2 within 300px of viewport top (likely board title)

```javascript
function isHeadingAfterGrid(heading) {
  var gridContainer = getGridContainer(doc);
  if (!gridContainer) return false;

  // Must come AFTER grid in DOM order
  var position = gridContainer.compareDocumentPosition(heading);
  if (!(position & Node.DOCUMENT_POSITION_FOLLOWING)) {
    return false;  // Heading is before grid - likely title
  }

  // Must not be near top of page
  if (heading.getBoundingClientRect().top < 300) {
    return false;  // Too close to top, probably title
  }

  return true;
}
```

### Why Grid Container Works

1. **Structural separation** - Pinterest renders board pins in one grid, recommendations in another
2. **Handles sections** - Distinguishes section thumbnails from actual pins using `/pin/` links
3. **Lazy-load aware** - Re-detects grid until enough pins are loaded before caching
4. **No text matching needed** - Works regardless of heading text or language
5. **Fails open** - If grid can't be determined, allows pins (other checks still apply)

### Filter Order

1. **Grid container check** (PRIMARY) - Skip pins outside the board grid
2. **H1/H2 post-grid detection** (SECONDARY) - Backup to catch recommendation sections
3. **Stuck detection** - Stop scrolling when no new pins found

### Variables

```javascript
var boardGridContainer = null;           // Cached grid for main board
var iframeGridContainers = new WeakMap(); // Cached grids per iframe
```

### Console Logging

```
[PA] Board has 5 sections - looking for pins grid (not sections grid)
[PA] Found main pins grid with 45 pins
[PA] Grid has few pins - will re-detect next scan (not caching)
[PA] Found h1/h2 sibling divider (post-grid): More ideas
[PA] Stopping: reached recommendations section
``` 




## Overview

A bookmarklet that downloads pin images from Pinterest boards into a ZIP file, with support for board sections.

## How It Works

### Initialization Flow

1. **Toggle Check**: If overlay already exists, remove it and exit (allows toggling off)
2. **Style Injection**: Adds CSS styles with `id="pa-styles"` to document head
3. **UI Creation**: `createUI()` builds and displays the overlay immediately
4. **Section Detection**: Runs `detectSectionsAsync()` in background while UI is visible
5. **Section Panel Update**: Populates sections list once detection completes

### Section Detection (`detectSections()`)

Three strategies are used to find board sections:

#### Strategy 1: JSON Parsing (Most Reliable)
- Scans ALL `<script>` tags on the page
- Looks for objects with `"__typename":"BoardSection"` marker
- Extracts `slug`, `pin_count`, and `title` fields from nearby context
- Also checks for `board_sections` or `sections` arrays in JSON

#### Strategy 2: DOM Link Scanning
- Finds all `<a>` tags with hrefs matching `/{username}/{board}/{section}`
- Filters out system routes: `pins`, `more_ideas`, `followers`, `activity`, `settings`, `edit`, `invite`, `organize`, `organise`, `collaborators`, etc.
- Only accepts links where parent container shows a pin count (e.g., "45 pins")
- Extracts section name from nearby heading elements

##### Section Name Number Merge Bug (Fixed v13.2)

**Problem**: Section names containing numbers would merge with pin counts when extracted from DOM.

Example:
- Section name: "IFA 2019"
- Pin count: "191 pins"
- DOM `textContent`: "IFA 2019191 pins" (no space between name and count)
- Regex `/(\d+)\s*(?:pins?|Pins?)/i` incorrectly captured "2019191"

**Solution**: Remove the section name from container text before searching for pin count:

```javascript
var name = decodeURIComponent(remainder).replace(/-/g, ' ');

// Remove section name from text before searching for pin count
// This prevents "IFA 2019" + "191 pins" = "IFA 2019191 pins" -> wrong count
var escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
var textWithoutName = containerText.replace(new RegExp(escapedName, 'gi'), ' ');

var countMatch = textWithoutName.match(/(\d+)\s*(?:pins?|Pins?)/i);
```

This transforms "IFA 2019191 pins" → " 191 pins" before regex matching, correctly extracting 191.

#### Strategy 3: Section Containers
- Queries elements with `data-test-id` containing "section" or "board-section"
- Extracts section info from contained links and text

### Async Detection (`detectSectionsAsync()`)

1. Runs `detectSections()` first without scrolling
2. Scrolls page progressively (0 to 2500px in 400px increments) to trigger lazy loading
3. Runs `detectSections()` again after scrolling
4. Returns to original scroll position

### Section Pin Count Detection (v11.6)

**Problem**: When navigating to a section page via client-side routing (clicking links within Pinterest), the `<script data-test-id="resource-response-data">` tags contain stale JSON from the previous page. There's also no visible pin count text in the UI on section pages.

**Solution**: `getSectionPinCount()` uses a two-step approach:

#### Step 1: Check DOM with URL Validation
```javascript
// Parse current URL to get expected slugs
var urlUsername = pathParts[0];
var urlBoardSlug = pathParts[1];
var urlSectionSlug = pathParts[2];

// Only use JSON if it matches current URL
if (opts.username === urlUsername &&
    opts.board_slug === urlBoardSlug &&
    opts.section_slug === urlSectionSlug) {
  return data.pin_count;  // Fresh data - use it
}
```

#### Step 2: Fetch Fresh HTML if Stale
```javascript
// DOM data is stale - fetch fresh HTML
var response = await fetch(location.href);
var html = await response.text();

// Parse BoardSectionResource from fetched HTML
var scriptMatches = html.match(/<script[^>]*data-test-id="resource-response-data"[^>]*>([^<]+)<\/script>/g);
// Extract and parse JSON to get pin_count
```

#### Why This Works
- **Hard refresh**: DOM has fresh JSON matching URL → uses Step 1
- **Client-side navigation**: DOM has stale JSON → Step 1 fails validation → Step 2 fetches fresh data
- **Authoritative source**: `BoardSectionResource` JSON contains exact `pin_count` from Pinterest's API

#### Console Logging
```
[PA] Found section pin count from DOM: 22          // Step 1 succeeded
[PA] DOM data stale, fetching fresh page data...   // Step 1 failed, trying Step 2
[PA] Found section pin count from fetched HTML: 22 // Step 2 succeeded
```

### Pin Collection (`scrollAndCollect()`)

1. Scrolls to top of page
2. Iteratively scrolls down, collecting pin data at each position
3. For each pin link (`a[href*="/pin/"]`):
   - Extracts pin ID from URL
   - Finds parent container (various selectors for Pinterest's changing DOM)
   - Extracts image URL from `<img>`, `srcset`, `data-src`, video poster, or background styles
4. Converts thumbnail URLs to original quality (`/originals/` path)
5. Stops when target pin count reached or no new pins found after multiple attempts

### Image URL Processing

- `getOriginalUrl()`: Converts Pinterest thumbnail URLs to full resolution
  - Pattern: `/\d+x\d*/` → `/originals/`
- `isValidPinImage()`: Filters out avatars and tiny thumbnails (75x75, 60x60, etc.)

### Section Download Process (Current Implementation)

The section download uses a **hidden iframe approach** that keeps the script running while loading each section's content separately.

#### `collectFromSectionIframe(sectionUrl, sectionName, expectedPinCount)`

1. **Create hidden iframe** - Full viewport size, opacity 0, pointer-events none, z-index -1
2. **Set iframe src** to the section URL (e.g., `https://www.pinterest.com/user/board/section-name`)
3. **Wait for load** - Poll for `onload` event with 10 second timeout
4. **Wait for render** - Additional 2 second delay for Pinterest's client-side rendering
5. **Access iframe document** - `iframe.contentDocument` or `iframe.contentWindow.document`
6. **Scroll and collect within iframe**:
   - Query `a[href*="/pin/"]` links in iframe document
   - Find parent container for each pin
   - Extract image URL from `img[src*="pinimg.com"]`
   - Scroll iframe window by 50% viewport height
   - Repeat up to 50 scroll iterations or until pin count reached
   - Stop early if no new pins found for 8 consecutive scrolls
7. **Cleanup** - Remove iframe from DOM
8. **Return** array of image URLs

#### `startDownload(startPct, endPct, selectedSections)`

1. **Sections first** (Rule 2) - Loop through selected sections before anything else
2. For each section:
   - Build full URL: `https://www.pinterest.com` + section.url
   - Call `collectFromSectionIframe()` with section URL, name, and expected pin count
   - Apply percentage slicing if partial download requested
   - Store results: `{section: name, urls: [...]}`
3. **Fetch images** - Download each image URL via `fetch()` with fallback to 736x
4. **Create ZIP** - Using custom uncompressed ZIP builder
5. **Trigger download** - Via blob URL and programmatic click

#### Why Iframe Works

- **Same origin** - Pinterest sections are on same domain, so iframe content is accessible
- **Script persistence** - Main page doesn't navigate, so our script keeps running
- **Isolation** - Each iframe loads only that section's pins (Rule 3 - accuracy)
- **No popups** - Doesn't trigger popup blockers like `window.open()` would

#### Folder Structure in ZIP

```
BoardName/
├── SectionOne/
│   ├── 0001.jpg
│   ├── 0002.jpg
│   └── ...
├── SectionTwo/
│   ├── 0001.jpg
│   └── ...
└── SectionThree/
    └── ...
```

Each section gets its own subfolder with sequentially numbered images.

### ZIP File Structure

```
BoardName/
├── 0001.jpg          (main board pins if no sections)
├── 0002.jpg
├── SectionName1/
│   ├── 0001.jpg
│   └── 0002.jpg
└── SectionName2/
    ├── 0001.jpg
    └── 0002.jpg
```

### UI Components

- **Header**: Board name, close button
- **Info**: Pin count, current section (if applicable)
- **Sections Panel**: Loading spinner → checkbox list of sections with pin counts
- **Download Buttons**: "Download All" + percentage-based options for large boards
- **Status Area**: Progress bar and status text
- **Message Area**: Warnings and completion info

## Dynamic UI & Animation System (v13.1)

The widget updates dynamically when navigating between pages via Pinterest's client-side routing, with smooth animations for the sections panel.

### URL Watching

```javascript
var currentUrl = location.href;
var urlWatchInterval = null;

function startUrlWatcher() {
  urlWatchInterval = setInterval(function() {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
      updateUIForNewPage();  // Triggers UI update + animation
    }
  }, 500);  // Poll every 500ms
}
```

### UI Structure

```
#pa-overlay (fixed position widget)
├── .pa-h (header - sticky)
├── .pa-c (content container)
│   ├── .pa-i (info panel - board name, pin count)
│   ├── #pa-sections-panel (animated container)
│   │   └── #pa-sections-content (fixed 290px height)
│   │       ├── Sections list (max-height: 170px, scrollable)
│   │       └── Main board checkbox
│   ├── #pa-btns (download controls)
│   ├── #pa-live-status (live download stats)
│   └── .pa-s (status area)
└── .pa-credit (author credit)
```

### Sections Panel Animation

The sections panel uses CSS height transitions for smooth expand/collapse:

```css
#pa-sections-panel {
  transition: height 0.25s ease;
  overflow: hidden;
}

#pa-sections-content {
  height: 290px;      /* Fixed height - fits ~5.5 section items */
  overflow-y: auto;
}
```

#### Fixed Height Breakdown (290px)
- **Sections list**: `max-height: 170px` (~5.5 items × 31px each)
- **Header area**: ~50px (checkbox, "Sections" label, scan button)
- **Main board checkbox**: ~58px
- **Margins**: ~12px

### Animation Behavior

#### Expanding (Section → Main Board)
1. Detect page type from URL **synchronously** (no async wait)
2. Show `#pa-sections-content` with centered loading spinner
3. Animate `#pa-sections-panel` from `0px` → `290px` immediately
4. Load sections async in background
5. Swap content when ready (no second animation - height already set)

```javascript
// Synchronous page type detection from URL
var pathParts = location.pathname.split('/').filter(Boolean);
var systemRoutes = ['pins', 'more_ideas', 'followers', ...];
var isGoingToSection = pathParts.length >= 3 &&
                       systemRoutes.indexOf(pathParts[2]) === -1;

// Animate IMMEDIATELY (before any async work)
sectionsPanel.style.height = oldSectionHeight + 'px';
requestAnimationFrame(function() {
  requestAnimationFrame(function() {
    sectionsPanel.style.height = targetHeight + 'px';
  });
});
```

#### Shrinking (Main Board → Section)
1. Detect section page from URL synchronously
2. Keep existing content during animation
3. Animate `#pa-sections-panel` from `290px` → `0px`
4. Clear content **after** animation completes (250ms)

```javascript
if (isGoingToSection) {
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      sectionsPanel.style.height = '0px';
      setTimeout(function() {
        sectionsPanel.innerHTML = '';  // Clear AFTER animation
        sectionsPanel.style.height = 'auto';
      }, 250);
    });
  });
}
```

### Key Animation Rules

1. **Instant detection** - Page type determined from URL path, not async data
2. **Animation first** - Height transition starts before any `await` calls
3. **Fixed target height** - Always animates to 290px (not measured dynamically)
4. **Content after animation** - Sections load while/after animation plays
5. **Double RAF** - Uses `requestAnimationFrame` twice to ensure browser paint before transition
6. **Cleanup after transition** - Content cleared only after 250ms animation completes

### Title Display (v13.9 - No Flash)

**Problem**: When navigating between boards/sections via client-side routing, the title would flash incorrectly:
1. URL changes immediately (e.g., `/user/board/cmf-ceramic-story`)
2. Script detects URL change, extracts slug → "cmf ceramic story" (lowercase)
3. DOM h1 still shows old page title (stale)
4. Script shows URL-derived title → **flash of wrong case**
5. DOM updates, script polls and corrects → "CMF - Ceramic Story"

**Solution**: Never show URL-derived title. Wait for DOM or show nothing.

```javascript
// Get expected slug from URL for matching
var expectedSlug = isGoingToSection ? pathParts[2] : pathParts[1];
var expectedNorm = decodeURIComponent(expectedSlug).toLowerCase().replace(/[-\s]/g, '');

// Check if DOM h1 already has correct title (matches URL)
var headingEl = document.querySelector('h1[title]') || document.querySelector('h1');
var domTitle = '';
var domReady = false;

if (headingEl) {
  // Pinterest h1 has title attribute with proper case: <h1 title="CMF - Ceramic Story">
  domTitle = headingEl.getAttribute('title') || headingEl.textContent.trim();
  var domNorm = domTitle.toLowerCase().replace(/[-\s]/g, '');

  // DOM ready if normalized title matches normalized URL slug
  if (domNorm === expectedNorm || domNorm.indexOf(expectedNorm) !== -1) {
    domReady = true;
  }
}

// Only show title if DOM is ready, otherwise leave empty
var titleHtml = '<div id="pa-title">' + (domReady ? domTitle : '') + '</div>';
```

#### Why This Works

1. **No flash** - Never shows URL-derived lowercase title
2. **Instant when ready** - If DOM already updated (rare), shows immediately
3. **Brief empty** - If DOM stale, shows empty (less jarring than wrong text)
4. **Polls for update** - Continues checking until h1 matches URL, then fills in

#### Pinterest's h1 Structure

```html
<h1 class="..." title="CMF - Ceramic Story" style="-webkit-line-clamp: 1;">
  CMF - Ceramic Story
</h1>
```

The `title` attribute contains the properly-cased name, which we prefer over `textContent`.

### State Reset on Page Change

When URL changes, `updateUIForNewPage()` resets:
- `boardSections = []`
- `currentSection = null`
- `totalPins = 0`
- `isPlaying = false`
- `downloadedFiles = []`
- `downloadedPinIds = new Set()`
- `pinQueue = []`
- Progress bars and status displays

## Key Variables

- `boardSections[]`: Array of `{name, slug, url, pinCount}`
- `currentSection`: Section name if viewing a section, null for main board
- `totalPins`: Expected pin count for progress calculation
- `isDownloading`: Lock to prevent concurrent downloads

## Console Logging

All debug output prefixed with `[PA]`:
- `[PA] Detecting sections for: /username/board`
- `[PA] Found BoardSection: Name (slug) N pins`
- `[PA] Total sections found: N`

## Streaming Download Architecture (v8+)

### Core Concept

The downloader uses a **streaming pipeline** architecture:
```
Sections (iframe) → Main Board Scroll → Detect Pins → Queue → Parallel Workers → Download → DOM Cleanup
```

**Sections are always downloaded first** (Rule 2), then main board pins stream in parallel.

### Download Flow (`startStreamingDownload`)

1. **Read UI selections** - Get checked sections and main board checkbox state
2. **Sections first** - For each selected section:
   - Load section in hidden iframe via `collectFromSectionIframe()`
   - Scroll iframe to collect all pins
   - Download images sequentially, tracking pin IDs in `downloadedPinIds`
   - Store in section subfolder: `BoardName/SectionName/00001.jpg`
3. **Main board** (if selected) - Start parallel workers + scroll loop
4. **Auto-save** - Create ZIP when complete (or when paused)

### Play/Pause System

- **Play Button**: Starts the streaming download process
- **Pause & Save Button**: Stops scrolling, completes active downloads, saves ZIP with collected pins
- User can pause anytime to get a partial download, then resume later

### Queue-Based Worker System

```javascript
var pinQueue = [];           // Pins waiting to download
var downloadedPinIds = new Set();  // Prevents duplicates (claimed on queue, not after download)
var activeDownloads = 0;     // Current concurrent fetches
var MAX_PARALLEL = 10;       // Worker count
```

**Workers**: 10 parallel async workers continuously pull from queue:
```javascript
async function downloadWorker() {
  while (isPlaying && !isPaused) {
    if (pinQueue.length === 0) { await sleep(50); continue; }
    var item = pinQueue.shift();
    // ... fetch and save
  }
}
```

**Scanner**: Runs during scroll, adds new pins to queue:
```javascript
function scanForNewPins() {
  // Scan DOM elements with [data-test-id="pin"]
  // Scan <script> tags for JSON pin data
  // CRITICAL: Add to downloadedPinIds IMMEDIATELY when queuing (not after download)
  // This prevents race conditions with parallel workers
}
```

### DOM Control Strategy

**CRITICAL**: Pinterest uses lazy loading - it only loads new pins when you scroll and there's visible space.

#### Option 1: Remove Elements (Fast, but breaks lazy loading)
```javascript
item.element.remove();
```
- Frees memory immediately
- BUT: Pinterest sees empty viewport, may stop loading new pins
- Risk: Incomplete downloads on large boards

#### Option 2: Fade Elements (Slower, but reliable)
```javascript
item.element.classList.add('pa-faded');  // opacity: 0.2
```
- Preserves DOM structure
- Pinterest's lazy loader keeps working
- Recommended for complete board downloads

#### Current Implementation (v7)
Uses `remove()` for speed. If boards aren't fully downloading, switch to fading.

### Scroll Loop

```javascript
async function scrollLoop() {
  while (isPlaying && !isPaused && !scrollAbort) {
    window.scrollBy(0, window.innerHeight * 1.5);
    await sleep(150);
    scanForNewPins();

    // Stuck detection: if no new pins for 20 iterations
    // Try aggressive scroll to bottom
    // If still stuck after 3 attempts, assume complete
  }
}
```

### Duplicate Prevention (v8 - Claim-on-Queue)

**Critical insight**: With 10 parallel workers, checking `downloadedPinIds` after download creates a race condition where the same pin can be queued multiple times before any worker finishes.

**Solution**: Claim pin IDs immediately when adding to queue, not after download:
```javascript
// In scanForNewPins():
if (downloadedPinIds.has(pinId)) return;  // Already claimed?
downloadedPinIds.add(pinId);              // CLAIM IMMEDIATELY
pinQueue.push({pinId, url, element});     // Then queue
```

**Three-layer protection**:
1. `downloadedPinIds.add(pinId)` - Claim atomically when queuing (prevents race conditions)
2. `container.dataset.paQueued` - DOM element marked to skip on rescan
3. Section pins claimed before main board starts (prevents cross-contamination)

### Live Stats Display

```
[●] Downloading... 1,234 saved
1234 downloaded · 56 queued · 10 active
```

Updates in real-time via `updateLiveStats()`.

### Section Download Flow

1. Sections download first via iframe (see Section Download Process above)
2. Section pin IDs added to `downloadedPinIds` to prevent re-download
3. Main board streams after sections complete
4. All files combined into single ZIP with folder structure

### Performance Tuning

| Parameter | Value | Notes |
|-----------|-------|-------|
| MAX_PARALLEL | 10 | Concurrent fetch workers |
| Scroll delay | 150ms | Time between scrolls |
| Worker poll | 50ms | Queue check interval |
| Stuck threshold | 20 | Iterations before aggressive scroll |

Increase MAX_PARALLEL for faster downloads (may hit rate limits).
Decrease scroll delay for faster scanning (may miss pins).

## Chunked Download / Pause & Resume (v14.4-v14.8)

### The Problem

When pausing a download and resuming, pins were being lost between chunks. Example: Chunk 1 ends at pin 43, Chunk 2 starts at pin 96 (missing pins 44-95).

### Root Cause

With 10 parallel workers, when `isPaused = true` is set:
1. Workers exit immediately without processing remaining queue
2. Pins that were claimed in `downloadedPinIds` but not yet downloaded are "orphaned"
3. On resume, those pin IDs are already marked as claimed, so they're skipped
4. DOM elements still have `paQueued` flags, so they're never re-scanned

### The Solution: Rebuild State from Actual Downloads

On pause, rebuild `downloadedPinIds` from ONLY successfully downloaded files:

```javascript
async function pauseAndSave() {
  isPaused = true;

  // Wait for in-flight downloads to complete
  while (activeDownloads > 0) await sleep(100);

  // REBUILD downloadedPinIds from ONLY successfully downloaded files
  var actuallyDownloaded = new Set();
  downloadedFiles.forEach(function(file) {
    if (file.pinId) actuallyDownloaded.add(file.pinId);
  });

  // Find orphaned pins (claimed but never downloaded)
  var orphanedPins = [];
  downloadedPinIds.forEach(function(id) {
    if (!actuallyDownloaded.has(id)) orphanedPins.push(id);
  });

  // Replace downloadedPinIds with only actually-downloaded pins
  downloadedPinIds = actuallyDownloaded;

  // Clear DOM flags for elements that weren't downloaded
  document.querySelectorAll('[data-pa-queued="true"]').forEach(function(el) {
    if (!el.dataset.paDownloaded) delete el.dataset.paQueued;
  });

  // Reset fileCounter to highest actually downloaded
  var maxFileNum = 0;
  downloadedFiles.forEach(function(file) {
    if (file.fileNum > maxFileNum) maxFileNum = file.fileNum;
  });
  fileCounter = maxFileNum;
}
```

### Pin Ordering Fix (v14.8-v14.9)

**Problem**: Rogue pins from further down the board appeared at the start of chunk 2.

**Root Cause**: DOM order ≠ visual order. Pinterest inserts elements anywhere in the DOM, not in scroll order.

**Solution**: Sort pins by visual Y position before queuing:

```javascript
function scanForNewPins() {
  var pinElements = document.querySelectorAll('[data-test-id="pin"]');

  // CRITICAL: Sort by visual position (top to bottom)
  var sortedPins = Array.from(pinElements).sort(function(a, b) {
    return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
  });

  // Also skip elements far below viewport (stale from previous scroll)
  sortedPins.forEach(function(container) {
    var rect = container.getBoundingClientRect();
    if (rect.top > viewportHeight * 3) return; // Skip - will be scanned when we scroll there
    // ... rest of scan logic
  });
}
```

## Large Board Download Limits (v15.1-v15.4)

### The Problem

Pinterest imposes implicit limits on continuous downloads:
- ~400 pins: First cap observed
- ~1000 pins: Second cap observed
- ~2000 pins: Third cap observed

### Root Causes

1. **Grid Container Detachment**: Pinterest's aggressive DOM virtualization removes our cached grid container from the document. All subsequent pins fail the `isInBoardGrid()` check.

2. **Element Recycling**: Pinterest recycles DOM elements - the same element that showed pin 1 now shows pin 1001, but our `paQueued` flag persists.

3. **Stuck Detection Too Aggressive**: Standard stuck detection (20 iterations) triggers too early on large boards.

### Solution 1: Validate Grid Container (v15.1)

Before using cached grid container, verify it's still in the document:

```javascript
function getGridContainer(doc) {
  if (isMainDoc && boardGridContainer) {
    // CRITICAL: Check if cached container is still in document
    if (!document.contains(boardGridContainer)) {
      console.log('[PA] Grid container detached from DOM - re-detecting');
      boardGridContainer = null;

      // Clear 'outside-grid' skip markers - they were based on old grid
      document.querySelectorAll('[data-pa-skipped="outside-grid"]').forEach(function(el) {
        delete el.dataset.paSkipped;
      });
    } else {
      return boardGridContainer;
    }
  }
  // ... re-detect grid
}
```

### Solution 2: Handle Element Recycling (v15.3)

Detect when Pinterest recycles an element for a different pin:

```javascript
function scanForNewPins() {
  sortedPins.forEach(function(container) {
    // Handle stale flags from RECYCLED elements
    if (container.dataset.paQueued || container.dataset.paDownloaded) {
      var link = container.querySelector('a[href*="/pin/"]');
      if (link) {
        var match = link.href.match(/\/pin\/([^\/]+)/);
        if (match && !downloadedPinIds.has(match[1])) {
          // Element was recycled - pin ID doesn't match what we processed
          delete container.dataset.paQueued;
          delete container.dataset.paDownloaded;
          container.style.opacity = '';
        }
      }
    }
    // ... rest of scan
  });
}
```

### Solution 3: Multi-Strategy Stuck Recovery (v15.4)

Extended stuck detection with multiple recovery strategies:

```javascript
if (noNewPinsCount > 30) {
  // Strategy 1: Scroll to absolute bottom
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(800);
  scanForNewPins();

  if (stillStuck) {
    // Strategy 2: Scroll up then back down (triggers Pinterest reload)
    window.scrollTo(0, document.body.scrollHeight - window.innerHeight * 10);
    await sleep(500);
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(800);
    scanForNewPins();
  }

  if (stillStuck) {
    // Strategy 3: Scroll WAY past bottom (Pinterest might extend scrollHeight)
    window.scrollBy(0, window.innerHeight * 20);
    await sleep(1000);
    scanForNewPins();
  }
}
```

### Solution 4: Staged Downloads (v15.5)

For very large boards (6000+ pins), memory becomes an issue. Auto-save every 2000 pins:

```javascript
// In downloadWorker, after adding file:
if (stagedDownloadEnabled && downloadedFiles.length >= 2000 && !isAutoSaving) {
  await autoSaveAndContinue();
}

async function autoSaveAndContinue() {
  isAutoSaving = true;

  // Wait for in-flight downloads
  while (activeDownloads > 0) await sleep(50);

  // Save ZIP
  chunkNumber++;
  var zipData = createZip(downloadedFiles);
  // ... trigger download

  // Track total and free memory
  totalDownloadedAllChunks += downloadedFiles.length;
  downloadedFiles = [];  // Free memory

  isAutoSaving = false;
}
```

### Key Insights

1. **Pinterest virtualizes aggressively** - Don't trust cached DOM references
2. **Pinterest recycles elements** - Check pin ID matches before trusting flags
3. **DOM order ≠ visual order** - Always sort by `getBoundingClientRect().top`
4. **Memory matters** - Auto-save chunks to prevent browser crashes on 5000+ pin boards
5. **Multiple recovery strategies** - One scroll technique isn't enough for all boards

## Pause/Resume Race Conditions (v17.0-v17.2)

### The Problem

When clicking pause and then resume, multiple issues caused broken downloads:
1. **Two ZIP files on single pause click** - Instead of one chunk, two downloads triggered
2. **State completely reset on resume** - `chunkNumber`, `downloadedPinIds`, `lastChunkBoundaryY` all reset to 0
3. **Orphaned pins** - Pins claimed in queue but never downloaded, lost between chunks

### What Didn't Work

#### Attempt 1: Stop URL Watcher Alone
```javascript
function pauseAndSave() {
  stopUrlWatcher();  // Prevent updateUIForNewPage() from running
  // ...
}
```
**Result**: Still downloaded two folders of the same pins. The URL watcher wasn't the only issue.

#### Attempt 2: Add window.paResumeState Persistence
```javascript
window.paResumeState = {
  chunkNumber: chunkNumber,
  lastChunkBoundaryY: lastChunkBoundaryY,
  downloadedPinIds: Array.from(downloadedPinIds)
};
```
**Result**: State was saved but still reset to 0 on resume. The IIFE-scoped variables were being wiped by something else.

#### Attempt 3: Move isPaused = true to Top of pauseAndSave
```javascript
async function pauseAndSave() {
  isPaused = true;  // Set immediately to prevent Done branch
  scrollAbort = true;
  // ... rest of pause logic
}
```
**Result**: Better - only one ZIP file. But 9 "orphaned" pins were lost between chunks. Workers exited before processing remaining queue.

### Root Causes Discovered

#### Bug 1: Race Condition Between Done Branch and pauseAndSave

When pause is clicked:
1. `pauseAndSave()` starts, sets `scrollAbort = true`
2. `scrollLoop` sees `scrollAbort` and exits
3. `startStreamingDownload` continues past scrollLoop, checks `if (!isPaused)` → TRUE (isPaused not set yet)
4. Calls `saveZip()` → **First ZIP (chunk 0)**
5. `pauseAndSave` continues, sets `isPaused = true`, saves → **Second ZIP (chunk 1)**

**Result**: Two ZIP files on single pause click!

#### Bug 2: URL Watcher Wiping State

The URL watcher runs every 500ms checking for navigation. During pause:
1. Pinterest updates URL (history state change during scrolling)
2. URL watcher detects change, calls `updateUIForNewPage()`
3. `updateUIForNewPage()` resets ALL state: `downloadedPinIds = new Set()`, `chunkNumber = 0`, etc.
4. On resume, state is zeroed out

#### Bug 3: Premature Worker Exit

Workers run with this condition:
```javascript
while (isPlaying && !isPaused) {
  if (pinQueue.length === 0) {
    if (!isScrolling) break;  // Exit if scroll stopped and queue empty
    await sleep(50);
    continue;
  }
  // ... process item
}
```

Setting `isPaused = true` immediately causes workers to exit via `!isPaused` check.
Setting `isScrolling = false` causes workers to exit when queue is momentarily empty between items.

Pins in queue when workers exit = **orphaned** (claimed but never downloaded).

### The Working Solution (v17.2)

#### Fix 1: pauseRequested Flag

Add a new flag that blocks the Done branch without affecting workers:

```javascript
var pauseRequested = false;

async function pauseAndSave() {
  pauseRequested = true;  // Block Done branch immediately
  scrollAbort = true;
  // DON'T set isPaused or isScrolling yet - workers still need to run

  // ... wait for queue to drain

  // NOW set flags (after workers done)
  isScrolling = false;
  isPaused = true;
}

// In startStreamingDownload, Done branch:
if (!isPaused && !pauseRequested) {  // Check BOTH flags
  await saveZip();
  // ...
}
```

#### Fix 2: Session Flag to Block URL Watcher

```javascript
// When download starts:
window.paSessionActive = true;

// In URL watcher:
if (window.paSessionActive) {
  return;  // Skip updateUIForNewPage() during active session
}

// When download completes (Done state):
window.paSessionActive = false;
```

#### Fix 3: Drain Queue Before Stopping Workers

```javascript
async function pauseAndSave() {
  pauseRequested = true;
  scrollAbort = true;
  // Keep isScrolling = true so workers don't exit on empty queue

  // Wait for queue to FULLY drain
  var drainTimeout = 0;
  var maxDrainWait = 150;  // 15 seconds max
  while ((activeDownloads > 0 || pinQueue.length > 0) && drainTimeout < maxDrainWait) {
    await sleep(100);
    drainTimeout++;
  }

  // NOW stop workers (queue is empty)
  isScrolling = false;
  isPaused = true;

  // ... calculate boundary, save ZIP
}
```

### Key Insight: Order of Flag Setting Matters

The fix depends on the precise order of operations:

| Step | pauseRequested | isPaused | isScrolling | Workers | Done Branch |
|------|----------------|----------|-------------|---------|-------------|
| 1. Pause clicked | ✓ set | false | true | Running | Blocked |
| 2. Queue draining | ✓ | false | true | Running | Blocked |
| 3. Queue empty | ✓ | false | true | Waiting | Blocked |
| 4. Set flags | ✓ | ✓ set | ✗ cleared | Exit | Blocked |
| 5. Save ZIP | ✓ | ✓ | ✗ | Stopped | Still blocked |

Workers continue until queue is empty, THEN exit. One download = one folder.

### Console Logging

```
[PA][PAUSE] pauseRequested=true, waiting for queue to drain...
[PA][PAUSE] Queue drained: 0 queued, 0 active
[PA][PAUSE] Setting isPaused=true, isScrolling=false
[PA][PAUSE] lastChunkBoundaryY: 4521, downloadedPinIds: 234
[PA] Saving chunk 0 with 234 files
```

On resume:
```
[PA][RESUME] Restoring state: chunkNumber=1, lastChunkBoundaryY=4521
[PA][RESUME] downloadedPinIds restored: 234 pins
[PA] Scrolling to Y=3821 (boundary - 2 viewports)
[PA] Skipping pin above boundary Y=4521
```

## Fetch Failure Recovery (v17.3)

### The Problem

Orphaned pins still occurred intermittently even after v17.2 fixes. Example: 3 successful pause/resumes, then 6 orphaned pins on the 4th.

### Root Cause

When `fetchMedia()` fails (network error, rate limiting, timeout), the worker still marked the element as downloaded:

```javascript
var data = await fetchMedia(item.url);
if (data) {
  downloadedFiles.push({ ... });  // Only happens on success
}

// BUG: This ALWAYS ran, even when fetch failed
if (item.element) {
  item.element.dataset.paDownloaded = 'true';  // Marked as done!
  item.element.style.opacity = '0.3';
}
```

Result:
1. Pin claimed in `downloadedPinIds` during scan
2. Pin removed from queue (shifted)
3. Fetch fails, NOT added to `downloadedFiles`
4. Element marked `paDownloaded = true` anyway
5. Pin never re-scanned (appears already done)
6. **Pin orphaned** - claimed but never downloaded

### The Solution (v17.3)

Move element marking inside the success block, and unclaim failed pins:

```javascript
var data = await fetchMedia(item.url);
if (data) {
  downloadedFiles.push({ ... });

  // Only mark as downloaded on SUCCESS
  if (item.element) {
    item.element.dataset.paDownloaded = 'true';
    item.element.style.opacity = '0.3';
  }
} else {
  // Fetch FAILED - unclaim for retry
  if (item.pinId) {
    downloadedPinIds.delete(item.pinId);
  }
  if (item.element) {
    delete item.element.dataset.paQueued;
    item.element.style.opacity = '';
  }
  console.log('[PA] Fetch failed for pin ' + item.pinId + ', unclaimed for retry');
}
```

### Why This Works

1. **Failed pins get second chance** - Removed from `downloadedPinIds`, cleared from DOM flags
2. **Next scroll re-scans** - Element no longer marked, gets re-queued
3. **Intermittent failures recovered** - Network glitches don't cause permanent loss
4. **Console visibility** - Log message shows which pins failed for debugging

### Known Limitation

Since we scroll DOWN continuously, failed pins in the middle of a chunk may not be re-scanned (we've already scrolled past). These pins are unclaimed but won't be retried unless scroll passes them again.

## Limitations

- Popup blocker may block section tab opening
- Cross-origin restrictions prevent accessing some section tabs
- Pinterest's DOM structure changes frequently, may require selector updates
- Large boards may timeout or miss some pins
- DOM removal can break Pinterest's lazy loading on very large boards

## Usage Tracking (Google Sheets Integration)

### Overview

The bookmarklet tracks anonymous usage stats to a Google Sheet via Google Apps Script. Each completed download logs:
- Timestamp
- Anonymous user ID (random, stored in localStorage)
- Number of pins downloaded
- Number of sections

### Why `fetch()` Failed

Pinterest enforces a strict **Content Security Policy (CSP)** with a `connect-src` directive that blocks `fetch()` and `XMLHttpRequest` to unauthorized domains like `script.google.com`.

Error:
```
Refused to connect to https://script.google.com/... because it does not appear in the connect-src directive of the Content Security Policy.
```

### Why Image Pixel Works

CSP `img-src` directives are typically more permissive than `connect-src`. By using `new Image().src = url`, the request is treated as an image load rather than an API call, bypassing the CSP restriction.

```javascript
// ❌ Blocked by CSP
fetch('https://script.google.com/macros/s/.../exec?uid=...');

// ✅ Works - image requests bypass connect-src
new Image().src = 'https://script.google.com/macros/s/.../exec?uid=...';
```

### Implementation

```javascript
// Track usage (non-blocking, uses image pixel to bypass CSP)
try {
  var uid = localStorage.getItem('pa_uid');
  if (!uid) {
    uid = 'u_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('pa_uid', uid);
  }
  new Image().src = 'https://script.google.com/macros/s/.../exec?uid=' + uid + '&pins=' + downloadedFiles.length + '&sections=' + boardSections.length;
} catch(e) {}
```

### Google Apps Script

```javascript
function doGet(e) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  s.appendRow([new Date(), e.parameter.uid, e.parameter.pins, e.parameter.sections]);
  return ContentService.createTextOutput("ok");
}
```

Deploy as: Web app → Execute as: Me → Who has access: Anyone
