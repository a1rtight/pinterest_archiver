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

## Recommendation Filtering (v10.0 - WORKING SOLUTION)

Pinterest uses **identical DOM markup** for board pins and recommendation pins - there's no `data-test-id`, class, or attribute that distinguishes them. Multiple approaches were tried and failed:

### Failed Approaches
- ❌ **Board ID JSON parsing** - Pinterest's JSON structure didn't match expected patterns
- ❌ **Container-based filtering** - Too aggressive, only captured 1 pin per section
- ❌ **Feed source markers** (BoardFeedResource vs RelatedPinFeedResource) - Inconsistent
- ❌ **Heading detection alone** - Found "More ideas" heading too early (10 pins out of 189)

### Working Solution: Hybrid Filtering

Combines **hard cap** (primary) with **recommendation section detection** (secondary):

```javascript
// 1. PRIMARY: Hard cap based on expected pin count with 15% buffer
var expectedPinCount = totalPins - sectionPinTotal;
var maxPins = Math.ceil(expectedPinCount * 1.15);

// Stop collecting when we hit the cap
if (downloadedPinIds.size >= maxPins) return;

// 2. SECONDARY: Detect "More ideas" section once near expected count
if (downloadedPinIds.size >= expectedPinCount * 0.9) {
  if (isInRecommendationSection(element)) {
    reachedRecommendations = true;
  }
}
```

#### `isInRecommendationSection(element)`

**Two-strategy detection:**

**Strategy 1: Document-wide heading search (v12.0 - CRITICAL FOR OTHERS' BOARDS)**
- Searches entire document for h1/h2/h3/h4 containing "more ideas", "find more", "picked for you", etc.
- Uses `compareDocumentPosition()` to check if the pin element comes AFTER that heading in DOM order
- Caches the heading per document to avoid repeated searches
- **This works even when the heading is in a different DOM branch** (common on others' boards)

```javascript
var recHeading = findRecHeadingInDoc(doc);  // Find "Find more ideas" h1
if (recHeading) {
  var position = recHeading.compareDocumentPosition(element);
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return true;  // Pin is after the recommendation heading
  }
}
```

**Strategy 2: Previous sibling walk (original approach)**
- Walks up the DOM checking previous siblings for recommendation markers
- Text containing "more ideas", "more to explore", "picked for you", "inspired by", "you might like"
- H1/H2/H3 headings with similar text

**Why Strategy 1 was needed:**
- On **your own boards**: Pinterest shows clear "More ideas" heading as a sibling of the pin grid
- On **others' boards**: The heading (e.g., `<h1>Find more ideas</h1>`) is in a completely different DOM branch
- The previous sibling walk never finds it because it's not a sibling at any ancestor level
- `compareDocumentPosition()` works regardless of DOM structure

#### Why This Works
1. **Board pins come first** - Pinterest always shows board pins before recommendations
2. **Buffer handles count inaccuracy** - 15% buffer accounts for Pinterest's sometimes-wrong counts
3. **Early termination** - If recommendation heading found before cap, stops immediately
4. **Applies to sections too** - Same logic works for both main board and section iframes

### Main Board Pin Counting (v11.0 - CRITICAL FIX)

When downloading sections AND main board, the cap check must only count **main board pins**, not the total of all downloaded pins (which includes section pins).

#### The Bug
```
Section pins downloaded: 191
Main board expected: 110 (cap: 127 with 15% buffer)
downloadedPinIds.size = 209 (includes section pins!)
209 >= 127 → "Reached pin cap" immediately! ❌
```

#### The Fix
Track `pinsBeforeMainBoard` and subtract it when checking the cap:

```javascript
// Set before main board download starts
pinsBeforeMainBoard = downloadedPinIds.size;  // e.g., 191 section pins

// In scanForNewPins() - count only MAIN BOARD pins against cap
var mainBoardPinCount = downloadedPinIds.size - pinsBeforeMainBoard;
if (expectedPinCount > 0 && mainBoardPinCount >= maxPins) {
  return 0; // Stop collecting
}
```

#### Result
```
mainBoardPinCount = 209 - 191 = 18 main board pins
18 < 127 → Keep collecting! ✓
```

This ensures:
1. Section pins don't count against main board cap
2. Main board can collect its full allocation
3. Each section and main board respects its own expected count 




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

#### Strategy 3: Section Containers
- Queries elements with `data-test-id` containing "section" or "board-section"
- Extracts section info from contained links and text

### Async Detection (`detectSectionsAsync()`)

1. Runs `detectSections()` first without scrolling
2. Scrolls page progressively (0 to 2500px in 400px increments) to trigger lazy loading
3. Runs `detectSections()` again after scrolling
4. Returns to original scroll position

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

## Limitations

- Popup blocker may block section tab opening
- Cross-origin restrictions prevent accessing some section tabs
- Pinterest's DOM structure changes frequently, may require selector updates
- Large boards may timeout or miss some pins
- DOM removal can break Pinterest's lazy loading on very large boards
