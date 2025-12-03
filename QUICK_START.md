# Quick Start - Test Configuration Selector

## ✅ What I Created for You:

1. **`src/components/TestConfigSelector.tsx`** - React component with 6 preset configs
2. **`src/components/TestConfigSelector.css`** - Styled dark theme matching your app
3. **`INTEGRATION_INSTRUCTIONS.md`** - Step-by-step integration guide

## 🚀 How to Use (Simple Version):

### 1. Add 3 Lines to App.tsx:

**At the top (imports):**
```typescript
import TestConfigSelector, { TestConfig } from './components/TestConfigSelector'
```

**In state section (~line 50):**
```typescript
const [activeTestConfig, setActiveTestConfig] = useState<string | undefined>(undefined)
```

**Before return statement (~line 300):**
```typescript
const handleTestConfigSelect = (config: TestConfig) => {
  console.log(`[App] 🧪 Test: ${config.testId}`)
  setPointSize(config.pointSize)
  setSpatialBoundsFilter(prev => ({
    ...prev,
    enabled: true,
    minLat: config.bounds.minLat,
    maxLat: config.bounds.maxLat,
    minLon: config.bounds.minLon,
    maxLon: config.bounds.maxLon
  }))
  setActiveTestConfig(config.testId)
  setSpatialFilterApplyCounter(c => c + 1)
}
```

**In JSX (~line 410):**
```typescript
<TestConfigSelector
  onConfigSelect={handleTestConfigSelect}
  currentTestId={activeTestConfig}
/>
```

### 2. Run It:

```bash
cd /Users/klesinger/github/deckGL/callipsoPotree
npm run dev
```

### 3. Test It:

1. Look for **"🧪 Test Config"** button in top-right corner
2. Click it to open the panel
3. Click **"T050 - Recommended - Balanced"**
4. Watch your visualization reload with:
   - Latitude: -20° to 20°
   - Longitude: -30° to 30°
   - Point size: 2px

## 📊 Available Test Configs:

| ID | Name | Depth | Points | FPS | Use When |
|----|------|-------|--------|-----|----------|
| **T050** | **Balanced (START HERE!)** | 4 | 2M | 50 | Best overall |
| T049 | Fast | 3 | 1M | 60 | Need smooth 60 FPS |
| T001 | Minimal | 0 | 100K | 60 | Quick overview |
| T003 | Medium | 2 | 500K | 60 | Good balance |
| T004 | High Detail | 3 | 1M | 50 | More detail needed |
| T005 | Very High | 4 | 2M | 40 | Maximum quality |

## 🎯 What It Does:

✅ **Automatically sets**:
- File: `CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz`
- Lat/Lon bounds (equatorial region)
- Point size
- Logs max depth, point budget, LOD settings

❌ **Doesn't do yet** (you'll need to implement):
- Pass maxDepth to COPC loader
- Pass pointBudget to COPC loader
- Pass LOD strategy to COPC loader

## 💡 Testing Workflow:

1. Start app: `npm run dev`
2. Click "🧪 Test Config" button
3. Select **T050** first
4. Check FPS (press F12 → Performance monitor)
5. Navigate around, test smoothness
6. Too slow? Try **T049** or **T003**
7. Too fast? Try **T005**
8. Record which config works best for your GPU

## 🔧 Full Integration (Optional):

See `INTEGRATION_INSTRUCTIONS.md` for:
- How to pass config to PointCloudViewer
- How to use maxDepth/pointBudget in COPC loader
- Advanced LOD strategy integration

## 📝 Console Logs:

Watch the browser console for:
```
[App] 🧪 Applying test configuration: T050
[App] 📁 Target file: CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz
[App] 🎯 Max Depth: 4
[App] 💰 Point Budget: 2,000,000
[App] 🎨 LOD Strategy: screen_space_error
[App] 📏 LOD Threshold: 2
[App] ⚡ Expected FPS: 50
```

## ❓ Questions?

1. **Where's the button?** → Top-right corner, look for "🧪 Test Config"
2. **Not seeing changes?** → Check browser console for logs
3. **FPS too low?** → Try T049 (fast config)
4. **Want more configs?** → Edit `TestConfigSelector.tsx` to add more from `data/copc_browser_test_configs.js`

---

**That's it!** Start with T050 and adjust from there. The component will help you find the perfect settings for your hardware! 🎉
