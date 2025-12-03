# How to Integrate Test Configuration Selector

## Step 1: Add the Component to App.tsx

Add this import at the top of `src/App.tsx`:

```typescript
import TestConfigSelector, { TestConfig } from './components/TestConfigSelector'
```

## Step 2: Add State for Test Config

Add this state variable after your other useState declarations (around line 50):

```typescript
const [activeTestConfig, setActiveTestConfig] = useState<string | undefined>(undefined)
```

## Step 3: Add Handler Function

Add this handler function (around line 300):

```typescript
const handleTestConfigSelect = (config: TestConfig) => {
  console.log(`[App] 🧪 Applying test configuration: ${config.testId}`)

  // Update point size
  setPointSize(config.pointSize)

  // Update spatial bounds filter with test config bounds
  setSpatialBoundsFilter(prev => ({
    ...prev,
    enabled: true,  // Enable spatial filter
    useUSBounds: false,
    useAOIBounds: false,
    minLat: config.bounds.minLat,
    maxLat: config.bounds.maxLat,
    minLon: config.bounds.minLon,
    maxLon: config.bounds.maxLon,
    minAlt: 0,
    maxAlt: 40
  }))

  // Set the filename in file search (you'll need to update this based on your file loading logic)
  // For now, we'll just log it
  console.log(`[App] 📁 Target file: ${config.filename}`)
  console.log(`[App] 🎯 Max Depth: ${config.maxDepth}`)
  console.log(`[App] 💰 Point Budget: ${config.pointBudget.toLocaleString()}`)
  console.log(`[App] 🎨 LOD Strategy: ${config.lodStrategy}`)
  console.log(`[App] 📏 LOD Threshold: ${config.lodThreshold}`)
  console.log(`[App] ⚡ Expected FPS: ${config.expectedFps}`)

  // Store active test config ID
  setActiveTestConfig(config.testId)

  // Trigger spatial filter apply to reload data
  setSpatialFilterApplyCounter(c => c + 1)

  // TODO: You'll need to implement maxDepth, pointBudget, lodStrategy in your COPC loader
  // These parameters should be passed to PointCloudViewer and used in your COPC loading logic
}
```

## Step 4: Add Component to JSX

Add the TestConfigSelector component in your return statement (around line 408), right before or after the FilterPanel:

```typescript
return (
  <div className="app">
    {/* Add this line: */}
    <TestConfigSelector
      onConfigSelect={handleTestConfigSelect}
      currentTestId={activeTestConfig}
    />

    <PointCloudViewer
      files={selectedFiles}
      // ... rest of props
    />

    {/* ... rest of your components */}
  </div>
)
```

## Step 5: Run Your App

```bash
npm run dev
```

## What You'll See:

1. **A "🧪 Test Config" button** in the top-right corner
2. **Click it** to open the test configuration panel
3. **Select a test** (start with T050 - Recommended Balanced)
4. **Watch the configuration apply:**
   - Spatial bounds will update automatically
   - Point size will change
   - File will be set (you'll see it in console)
   - Data will reload with new bounds

## What Configurations Do:

| Test ID | Description | Max Depth | Point Budget | Expected FPS |
|---------|-------------|-----------|--------------|--------------|
| **T050** | **Recommended - Start here!** | 4 | 2M | 50 FPS |
| **T049** | Fast (guaranteed 60 FPS) | 3 | 1M | 60 FPS |
| T001 | Minimal (fastest) | 0 | 100K | 60 FPS |
| T003 | Medium detail | 2 | 500K | 60 FPS |
| T004 | High detail | 3 | 1M | 50 FPS |
| T005 | Very high detail | 4 | 2M | 40 FPS |

## Testing Workflow:

1. **Start with T050** (recommended balanced config)
2. Check your FPS in the browser (F12 → Performance monitor)
3. If too slow → Try T049 or T003
4. If too fast → Try T005
5. Navigate around and test smoothness
6. Record your observations

## Next Steps - Full Integration:

To fully integrate COPC loading parameters, you'll need to:

### 1. Pass Config to PointCloudViewer

Update `App.tsx` around line 410:

```typescript
<PointCloudViewer
  files={selectedFiles}
  colorMode={colorMode}
  colormap={colormap}
  pointSize={pointSize}
  viewMode={viewMode}
  // Add these new props:
  copcConfig={{
    maxDepth: activeTestConfig ? TEST_CONFIGS[activeTestConfig].maxDepth : 4,
    pointBudget: activeTestConfig ? TEST_CONFIGS[activeTestConfig].pointBudget : 2000000,
    lodStrategy: activeTestConfig ? TEST_CONFIGS[activeTestConfig].lodStrategy : 'distance_based',
    lodThreshold: activeTestConfig ? TEST_CONFIGS[activeTestConfig].lodThreshold : 10
  }}
  // ... rest of props
/>
```

### 2. Update PointCloudViewer Props

In `src/components/PointCloudViewer.tsx`, add to the props interface:

```typescript
interface PointCloudViewerProps {
  // ... existing props
  copcConfig?: {
    maxDepth: number
    pointBudget: number
    lodStrategy: string
    lodThreshold: number
  }
}
```

### 3. Use Config in COPC Loader

Wherever you're loading COPC data, use these values:

```typescript
// In your COPC loading code:
const { maxDepth, pointBudget, lodStrategy, lodThreshold } = copcConfig || {}

// Apply to your COPC loader
loadCOPC({
  maxDepth: maxDepth || 4,
  pointBudget: pointBudget || 2000000,
  // ... etc
})
```

## Tips:

- The configurations automatically set the equatorial region bounds (-20° to 20° lat, -30° to 30° lon)
- All configs target the same file: `CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz`
- The console will show detailed info about what's being applied
- You can switch configs in real-time while the app is running!

## Questions?

Check the console logs - they'll show you exactly what's happening when you apply a configuration.
