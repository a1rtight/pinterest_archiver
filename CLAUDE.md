# Pinterest Archiver - System Documentation

## Core Rules

1. **One-click downloading** - The download solution should be one click, or if not possible, as simple as possible
2. **Sections first** - Handle sections first as they are the problematic area
3. **Section accuracy** - Each section should contain only the pins within that section of the board, no more, no less

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

## Limitations

- Popup blocker may block section tab opening
- Cross-origin restrictions prevent accessing some section tabs
- Pinterest's DOM structure changes frequently, may require selector updates
- Large boards may timeout or miss some pins
