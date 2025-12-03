# COPC Visualization Testing Guide

## 📁 Files Created

1. **`copc_test_configurations.json`** - Complete test suite (50 configurations) in JSON format
2. **`copc_browser_test_configs.js`** - JavaScript module for your deck.gl app
3. **`test_results_tracker.html`** - Interactive browser-based testing interface
4. **`TESTING_GUIDE.md`** - This file

---

## 🎯 Quick Start

### Option 1: Interactive Browser Interface (Recommended)

1. Open `test_results_tracker.html` in your browser
2. Select a test configuration from the grid
3. Copy the configuration to clipboard
4. Apply it to your visualization app
5. Record your results in the form
6. Export results to CSV when done

### Option 2: Direct Import in Your App

```javascript
import { COPC_TEST_CONFIGS, getTestConfig } from './copc_browser_test_configs.js';

// Get a specific test
const config = getTestConfig('T050');

// Apply to your COPC loader
const settings = {
  file: config.filename,
  bounds: {
    minLat: config.bounds.minLat,
    maxLat: config.bounds.maxLat,
    minLon: config.bounds.minLon,
    maxLon: config.bounds.maxLon
  },
  maxDepth: config.maxDepth,
  pointBudget: config.pointBudget,
  lodStrategy: config.lodStrategy,
  lodThreshold: config.lodThreshold,
  pointSize: config.pointSize
};
```

---

## 🧪 Test Configuration Structure

Each test has these parameters:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `testId` | Unique identifier | "T050" |
| `name` | Descriptive name | "Recommended - Balanced" |
| `maxDepth` | Maximum octree depth to load | 4 |
| `pointBudget` | Maximum points to render | 2000000 |
| `lodStrategy` | Level-of-detail algorithm | "screen_space_error" |
| `lodThreshold` | Distance/error threshold | 2.0 |
| `decimation` | Point reduction strategy | null |
| `pointSize` | Pixel size for rendering | 2 |
| `expectedFps` | Target frame rate | 50 |
| `useCase` | When to use this config | "Best overall default" |

---

## 📊 Test Categories

### 🌟 RECOMMENDED (Start Here!)

**T049 - Fast (60 FPS)**
- Depth: 3
- Budget: 1,000,000 points
- Best for: Smooth navigation, presentations

**T050 - Balanced (Best Overall)**
- Depth: 4
- Budget: 2,000,000 points
- Best for: General use, good quality/performance

### 📈 DETAIL LEVELS (Progressive complexity)

| Test | Depth | Points | FPS | Use Case |
|------|-------|--------|-----|----------|
| T001 | 0 | 100K | 60 | Initial overview |
| T002 | 1 | 250K | 60 | Quick preview |
| T003 | 2 | 500K | 60 | Interactive exploration |
| T004 | 3 | 1M | 50 | Detailed analysis |
| T005 | 4 | 2M | 40 | Very high detail |
| T006 | 5 | 5M | 25 | Scientific analysis |
| T007 | 10 | 10M | 10 | Stress test |

### 💰 POINT BUDGET (Fixed budget tests)

| Test | Budget | FPS | Description |
|------|--------|-----|-------------|
| T008 | 500K | 60 | Strict performance |
| T009 | 1M | 60 | Good performance |
| T010 | 2M | 50 | Balanced |
| T011 | 3M | 40 | High detail |
| T012 | 5M | 30 | Maximum @ 30 FPS |

### 📱 MOBILE OPTIMIZED

**T027 - Low End Mobile**
- Depth: 2, Budget: 300K, Decimation: every 2nd point
- For: Tablets, older phones

**T028 - Modern Mobile**
- Depth: 3, Budget: 500K
- For: iPhone 12+, modern Android

### 🖥️ DESKTOP OPTIMIZED

**T029 - Standard GPU**
- GTX 1060, RX 580 level
- Depth: 4, Budget: 2M

**T030 - High-End GPU**
- RTX 3080+, RX 6800+ level
- Depth: 5, Budget: 5M

### 🏔️ ALTITUDE FILTERS

| Test | Altitude Range | Use Case |
|------|---------------|----------|
| T034 | 0-10 km | Surface clouds |
| T035 | 0-15 km | Troposphere |
| T036 | 15-30 km | Stratosphere |
| T037 | 0-40 km | Full column |

### ☁️ BACKSCATTER FILTERS

**T038 - Clouds Only**
- Filter: backscatter > 0.001
- Shows only dense cloud features

**T039 - Aerosols**
- Filter: backscatter 0.0001-0.01
- Shows aerosol layers

### ✂️ DECIMATION TESTS

| Test | Strategy | Reduction |
|------|----------|-----------|
| T021 | Every 2nd point | 50% |
| T022 | Every 3rd point | 67% |
| T023 | Random 50% | 50% |

---

## 🎮 Testing Workflow

### Step 1: Setup
```javascript
// In your visualization app, set these as constants:
const PRESET_FILE = "CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz";
const PRESET_BOUNDS = {
  minLat: -20,
  maxLat: 20,
  minLon: -30,
  maxLon: 30
};
```

### Step 2: Select Test
1. Open `test_results_tracker.html`
2. Browse test categories
3. Click a test configuration
4. Review the settings displayed

### Step 3: Apply Configuration
```javascript
// Method 1: Copy from HTML interface
const config = {
  /* paste from clipboard */
};

// Method 2: Import directly
import { getTestConfig } from './copc_browser_test_configs.js';
const config = getTestConfig('T050');
```

### Step 4: Monitor Performance
Track these metrics:
- **Initial load time** (use `performance.now()`)
- **FPS** (use browser dev tools or stats.js)
- **Memory usage** (Chrome: Performance tab)
- **Point count** (from your COPC loader)
- **Node count** (from your COPC loader)

### Step 5: Record Results
Use the form in `test_results_tracker.html` to record:
- Hardware specs (GPU, RAM, browser)
- Performance metrics (FPS, load time, memory)
- Subjective ratings (quality 1-10, smoothness 1-10)
- Notes about visual quality, issues, etc.

### Step 6: Export Results
Click "Export to CSV" to download all results for analysis.

---

## 📏 Metrics to Record

### Automatic (from your app):
```javascript
// Initial load
const startTime = performance.now();
await loadCOPC(config);
const loadTime = performance.now() - startTime;

// During rendering
const stats = {
  fps: currentFPS,
  memoryMB: performance.memory.usedJSHeapSize / 1024 / 1024,
  pointCount: visiblePoints.length,
  nodeCount: loadedNodes.length
};
```

### Manual observations:
- **Visual Quality (1-10)**: How good does it look?
- **Navigation Smoothness (1-10)**: How smooth is pan/zoom?
- **Notes**: Any issues, artifacts, recommendations

---

## 🎯 Recommended Testing Order

### Phase 1: Find Your Baseline (5 tests)
1. **T049** - Fast baseline
2. **T050** - Balanced baseline
3. **T004** - Medium detail
4. **T005** - High detail
5. **T003** - Low detail

### Phase 2: Optimize for Your Hardware (10 tests)
Based on Phase 1 results:
- Too slow? Try T001-T003, T027-T028
- Too fast? Try T005-T007, T030
- Just right? Try similar configs with different strategies

### Phase 3: Feature Testing (10 tests)
- Altitude filters (T034-T037)
- Backscatter filters (T038-T039)
- Decimation strategies (T021-T023)
- Progressive loading (T018-T020)

### Phase 4: Fine-Tuning (25+ tests)
Test all remaining configurations to find the perfect settings for your use case.

---

## 💡 Tips for Best Results

### Performance Tips:
1. **Clear cache** between tests for consistent results
2. **Run each test 3 times** and average the results
3. **Test under different network conditions** (local vs. remote files)
4. **Test with different camera positions** (overhead vs. angled)

### Quality Assessment:
1. Look for:
   - Point density uniformity
   - No visible LOD popping
   - Clear atmospheric features
   - Smooth color gradients

2. Issues to note:
   - Gaps in point cloud
   - Sudden detail changes
   - Rendering artifacts
   - Memory leaks over time

### Configuration Selection:
- **60 FPS required?** Start with T049
- **Quality priority?** Start with T050
- **Mobile?** Start with T028
- **Scientific analysis?** Start with T045
- **Unknown hardware?** Start with T031

---

## 📈 Analyzing Results

After testing, look for:

1. **FPS Sweet Spot**: Which configs give you 45-60 FPS?
2. **Quality Threshold**: What's the minimum detail level acceptable?
3. **Memory Limits**: Where does performance degrade?
4. **Best Strategy**: Which LOD strategy works best?

Example analysis:
```
Test Results Summary:
- Best FPS: T049 (60), T003 (60), T008 (60)
- Best Quality: T050 (8/10), T032 (8/10), T004 (7/10)
- Best Overall: T050 (balanced 50 FPS, quality 8/10)

Recommendation: Use T050 as default, with T049 for mobile
```

---

## 🔧 Customizing Configurations

You can create your own custom configs:

```javascript
const myCustomConfig = {
  testId: "CUSTOM_01",
  name: "My Custom Config",
  filename: PRESET_FILE,
  bounds: PRESET_BOUNDS,
  maxDepth: 3,
  pointBudget: 1500000,
  lodStrategy: "distance_based",
  lodThreshold: 12,
  decimation: null,
  pointSize: 2,
  expectedFps: 55,
  useCase: "My specific use case"
};
```

---

## 📊 Example Results Template

| Test | GPU | FPS | Load | Quality | Notes |
|------|-----|-----|------|---------|-------|
| T049 | M1 | 60 | 800ms | 7/10 | Smooth, good for demo |
| T050 | M1 | 52 | 1200ms | 9/10 | **Best overall** |
| T004 | M1 | 58 | 950ms | 8/10 | Good alternative |

**Final Recommendation**: T050 for production, T049 for mobile/low-end

---

## 🚀 Next Steps

1. ✅ Open `test_results_tracker.html`
2. ✅ Run recommended tests (T049, T050)
3. ✅ Record your results
4. ✅ Export to CSV for documentation
5. ✅ Choose your production configuration
6. ✅ Implement in your app with preset bounds

---

## 📞 Support

If you need help:
1. Review test configurations in the HTML interface
2. Check browser console for errors
3. Monitor FPS with browser dev tools
4. Test with different camera positions

Happy testing! 🎉
