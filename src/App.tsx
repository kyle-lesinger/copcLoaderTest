import { useState, useEffect, useCallback } from 'react'
import PointCloudViewer from './components/PointCloudViewer'
import FilterPanel from './components/FilterPanel'
import ControlPanel from './components/ControlPanel'
import ControlsInfo from './components/ControlsInfo'
import DataInfo from './components/DataInfo'
import { Colormap } from './utils/colormaps'
import { LatLon } from './utils/aoiSelector'
import { searchCalipsoFiles, FileSearchResult, getAvailableFileList, FileMode } from './utils/fileSearch'
import { TestConfig } from './components/TestConfigSelector'
import './App.css'

export type ColorMode = 'elevation' | 'intensity' | 'classification'
export type ViewMode = 'space' | '2d'
export type { Colormap }

export interface DataRange {
  elevation: [number, number] | null
  intensity: [number, number] | null
}

export interface HeightFilter {
  enabled: boolean
  min: number
  max: number
}

export interface SpatialBoundsFilter {
  enabled: boolean
  useUSBounds: boolean  // If true, use US bounding box preset
  useAOIBounds: boolean  // If true, use AOI polygon bounding box
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
  minAlt: number
  maxAlt: number
}

export interface DateRangeFilter {
  enabled: boolean
  startDate: string // ISO datetime string YYYY-MM-DDTHH:mm:ss
  endDate: string
}

export type BandType = 'all' | 'day' | 'night'

function App() {
  // File management
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])
  const [foundFiles, setFoundFiles] = useState<FileSearchResult | null>(null)
  const [spatialFilterApplyCounter, setSpatialFilterApplyCounter] = useState(0)
  const [fileSearchTrigger, setFileSearchTrigger] = useState(0) // Counter to force file search re-run

  const [colorMode, setColorMode] = useState<ColorMode>('intensity')
  const [colormap, setColormap] = useState<Colormap>('calipso')
  const [pointSize, setPointSize] = useState(2.0)
  const [viewMode] = useState<ViewMode>('2d') // Fixed to 2D mode only

  // Global data range - never changes, represents full unfiltered data
  const [globalDataRange, setGlobalDataRange] = useState<DataRange>({
    elevation: null,
    intensity: null
  })

  // Current data range - may be filtered
  const [dataRange, setDataRange] = useState<DataRange>({
    elevation: null,
    intensity: null
  })

  // Height filter state
  const [heightFilter, setHeightFilter] = useState<HeightFilter>({
    enabled: false,
    min: 0,
    max: 40
  })

  // Spatial bounds filter state
  // Default bounds cover global range to match CALIPSO orbital data
  // Data typically spans: Lon -180° to 180°, Lat -82° to 82° (polar orbit)
  // US bounds: Lon -125° to -66°, Lat 24° to 49°
  const [spatialBoundsFilter, setSpatialBoundsFilter] = useState<SpatialBoundsFilter>({
    enabled: false,
    useUSBounds: false,
    useAOIBounds: false,
    minLon: -180,
    maxLon: 180,
    minLat: -82,  // CALIPSO's polar orbit coverage
    maxLat: 82,   // CALIPSO's polar orbit coverage
    minAlt: 0,
    maxAlt: 40
  })

  // Date range filter state
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>({
    enabled: false,
    startDate: '2023-06-30T16:00:00',
    endDate: '2023-06-30T17:00:00'
  })

  // Band type filter state
  const [selectedBand, setSelectedBand] = useState<BandType>('all')

  // AOI state
  const [aoiPolygon, setAoiPolygon] = useState<LatLon[] | null>(null)
  const [isDrawingAOI, setIsDrawingAOI] = useState(false)
  const [hasAOIData, setHasAOIData] = useState(false)
  const [aoiPointCount, setAoiPointCount] = useState<number>(0)
  const [showScatterPlotTrigger, setShowScatterPlotTrigger] = useState(false)

  // Track if height filter has been initialized to prevent overwriting user changes
  const [heightFilterInitialized, setHeightFilterInitialized] = useState(false)

  // Ground mode state
  const [isGroundModeActive, setIsGroundModeActive] = useState(false)
  const [groundCameraPosition, setGroundCameraPosition] = useState<{ lat: number, lon: number } | null>(null)

  // Test configuration state
  const [activeTestConfig, setActiveTestConfig] = useState<string | undefined>(undefined)
  const [testConfigMaxDepth, setTestConfigMaxDepth] = useState<number | undefined>(undefined)
  const [testConfigMaxNodes, setTestConfigMaxNodes] = useState<number | undefined>(undefined)

  const handleToggleDrawAOI = () => {
    setIsDrawingAOI(!isDrawingAOI)
    if (isDrawingAOI) {
      // Finish drawing
      // The polygon will be stored by the GlobeViewer
    }
  }

  const handleClearAOI = () => {
    setAoiPolygon(null)
    setHasAOIData(false)
    setAoiPointCount(0)
    setIsDrawingAOI(false)
  }

  const handleShowScatterPlot = () => {
    setShowScatterPlotTrigger(prev => !prev)
  }

  const handleAOIDataReady = (hasData: boolean, pointCount?: number) => {
    setHasAOIData(hasData)
    setAoiPointCount(pointCount || 0)
  }

  const handlePolygonUpdate = (polygon: LatLon[]) => {
    setAoiPolygon(polygon)
  }

  // View mode is fixed to 2D - removed toggle functionality
  const handleViewModeChange = (mode: ViewMode) => {
    // No-op: View mode is fixed to 2D
    console.log('[App] View mode is fixed to 2D mode only')
  }

  const handleSpatialBoundsFilterChange = (updates: Partial<SpatialBoundsFilter>) => {
    setSpatialBoundsFilter(prev => {
      let newFilter = { ...prev, ...updates }

      // Handle US bounds preset toggle
      if ('useUSBounds' in updates) {
        if (updates.useUSBounds) {
          console.log('[App] 🇺🇸 US bounding box preset ENABLED')
          // Apply US bounds: Continental US coverage
          newFilter = {
            ...newFilter,
            useUSBounds: true,
            useAOIBounds: false,  // Disable AOI bounds when using US bounds
            minLon: -125,  // West coast
            maxLon: -66,   // East coast
            minLat: 24,    // Southern tip (Florida Keys)
            maxLat: 49,    // Northern border (US-Canada)
            minAlt: 0,     // Sea level
            maxAlt: 40     // Maximum altitude
          }
        } else {
          console.log('[App] 🌍 US bounding box preset DISABLED - returning to custom bounds')
          newFilter = {
            ...newFilter,
            useUSBounds: false
          }
        }
      }

      // Handle AOI bounds preset toggle
      if ('useAOIBounds' in updates) {
        if (updates.useAOIBounds && aoiPolygon && aoiPolygon.length >= 3) {
          console.log('[App] 🎯 AOI bounding box ENABLED')
          // Calculate bounding box from AOI polygon
          const lats = aoiPolygon.map(p => p.lat)
          const lons = aoiPolygon.map(p => p.lon)
          const minLat = Math.min(...lats)
          const maxLat = Math.max(...lats)
          const minLon = Math.min(...lons)
          const maxLon = Math.max(...lons)

          console.log(`[App] 📍 AOI bounds: Lon ${minLon.toFixed(2)}° to ${maxLon.toFixed(2)}°, Lat ${minLat.toFixed(2)}° to ${maxLat.toFixed(2)}°`)

          // Apply AOI bounding box
          newFilter = {
            ...newFilter,
            useAOIBounds: true,
            useUSBounds: false,  // Disable US bounds when using AOI bounds
            minLon,
            maxLon,
            minLat,
            maxLat,
            minAlt: 0,     // Keep altitude range
            maxAlt: 40
          }
        } else {
          if (updates.useAOIBounds && (!aoiPolygon || aoiPolygon.length < 3)) {
            console.log('[App] ⚠️  Cannot enable AOI bounds - no AOI polygon defined')
          } else {
            console.log('[App] 🌍 AOI bounding box DISABLED - returning to custom bounds')
          }
          newFilter = {
            ...newFilter,
            useAOIBounds: false
          }
        }
      }

      // Log when filter is enabled/disabled
      if ('enabled' in updates && updates.enabled !== prev.enabled) {
        if (updates.enabled) {
          console.log('[App] ✅ Spatial bounds filter ENABLED (toggle ON)')
          console.log('[App] ℹ️  Data will NOT load until you click "Apply Filter" button')
          // Do NOT increment counter here - only on Apply Filter button
        } else {
          console.log('[App] ❌ Spatial bounds filter DISABLED')
        }
      }

      // If filter values changed (Apply Filter button clicked), increment counter
      // This happens when user clicks "Apply Filter" in the spatial bounds panel
      const valuesChanged = ('minLon' in updates || 'maxLon' in updates ||
                            'minLat' in updates || 'maxLat' in updates ||
                            'minAlt' in updates || 'maxAlt' in updates)

      if (valuesChanged && newFilter.enabled) {
        console.log('[App] 🔄 Spatial bounds "Apply Filter" button clicked')
        // Increment apply counter to trigger reload with new bounds
        setSpatialFilterApplyCounter(c => c + 1)
      }

      return newFilter
    })
  }

  const handleResetSpatialBoundsFilter = () => {
    setSpatialBoundsFilter(prev => ({
      ...prev,
      minLon: globalDataRange.elevation ? -180 : -180,
      maxLon: globalDataRange.elevation ? 180 : 180,
      minLat: globalDataRange.elevation ? -90 : -90,
      maxLat: globalDataRange.elevation ? 90 : 90,
      minAlt: globalDataRange.elevation ? globalDataRange.elevation[0] : 0,
      maxAlt: globalDataRange.elevation ? globalDataRange.elevation[1] : 40
    }))
  }

  const handleDateRangeFilterChange = (updates: Partial<DateRangeFilter>) => {
    setDateRangeFilter(prev => {
      const newFilter = { ...prev, ...updates }

      // Log when filter is enabled/disabled
      if ('enabled' in updates && updates.enabled !== prev.enabled) {
        if (updates.enabled) {
          console.log('[App] ✅ Date range filter ENABLED')
          console.log(`[App] 📅 Date range: ${prev.startDate} to ${prev.endDate}`)
        } else {
          console.log('[App] ❌ Date range filter DISABLED')
        }
      }

      return newFilter
    })
  }

  const handleResetDateRangeFilter = () => {
    setDateRangeFilter({
      enabled: false,
      startDate: '2023-06-30T16:00:00',
      endDate: '2023-06-30T17:00:00'
    })
  }

  const handleBandChange = (band: BandType) => {
    console.log(`[App] 🔄 Band type changed to: ${band}`)
    if (dateRangeFilter.enabled) {
      console.log(`[App] 🔍 Will search for files matching band "${band}" and date range`)
      console.log(`[App] 📅 Date range: ${dateRangeFilter.startDate} to ${dateRangeFilter.endDate}`)
    }
    setSelectedBand(band)
  }

  const handleToggleGroundMode = () => {
    setIsGroundModeActive(prev => !prev)
    // Reset ground camera position when deactivating
    if (isGroundModeActive) {
      setGroundCameraPosition(null)
    }
  }

  const handleGroundCameraPositionSet = (lat: number, lon: number) => {
    setGroundCameraPosition({ lat, lon })
  }

  const handleTestConfigSelect = (config: TestConfig) => {
    console.log(`[App] 🧪 Applying test configuration: ${config.testId}`)

    // Clear existing data first to force a fresh reload
    console.log(`[App] 🗑️  Clearing existing data...`)
    setSelectedFiles([])
    setFoundFiles(null)

    // Reset data range to force camera recenter on new data load
    setGlobalDataRange({ elevation: null, intensity: null })
    setDataRange({ elevation: null, intensity: null })

    // Small delay to ensure React processes the state update
    setTimeout(() => {
      console.log(`[App] 🔄 Loading new configuration...`)

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

      // Log the configuration parameters
      console.log(`[App] 📁 Target file: ${config.filename}`)
      console.log(`[App] 🎯 Max Depth: ${config.maxDepth}`)
      console.log(`[App] 💰 Point Budget: ${config.pointBudget.toLocaleString()}`)
      console.log(`[App] 🎨 LOD Strategy: ${config.lodStrategy}`)
      console.log(`[App] 📏 LOD Threshold: ${config.lodThreshold}`)
      console.log(`[App] ⚡ Expected FPS: ${config.expectedFps}`)

      // Store active test config ID and parameters
      setActiveTestConfig(config.testId)
      setTestConfigMaxDepth(config.maxDepth)

      // Convert pointBudget to maxNodes (rough estimate: assume avg 30k points per node)
      const avgPointsPerNode = 30000
      const estimatedMaxNodes = Math.ceil(config.pointBudget / avgPointsPerNode)
      setTestConfigMaxNodes(estimatedMaxNodes)

      console.log(`[App] 🔢 Calculated maxNodes: ${estimatedMaxNodes} (from pointBudget: ${config.pointBudget.toLocaleString()})`)

      // Load only the specific test file(s) specified in the config
      // For tiled mode, this will be 4 tiles for the single timestamp
      const availableFiles = getAvailableFileList()
      const baseFilename = config.filename.replace('.copc.laz', '')

      // Filter for files matching this specific timestamp
      // In tiled mode: get all 4 tiles for this timestamp
      // In single mode: get just the one file
      const testFiles = availableFiles.filter(file => file.includes(baseFilename))

      console.log(`[App] 🎯 Loading ${testFiles.length} file(s) for test:`)
      testFiles.forEach((file, idx) => {
        console.log(`  ${idx + 1}. ${file.split('/').pop()}`)
      })

      // Directly set the files to load (bypassing date range filter)
      setSelectedFiles(testFiles)

      // Trigger spatial filter apply to process these files
      setTimeout(() => {
        setSpatialFilterApplyCounter(c => c + 1)
      }, 100)
    }, 100)
  }

  const handleGlobalDataRangeUpdate = useCallback((range: DataRange) => {
    // Set both global range (for validation) and current range (for display)
    setGlobalDataRange(range)
    setDataRange(range)
  }, [])

  // Update height filter range when data loads (only on initial load)
  useEffect(() => {
    if (globalDataRange.elevation && !heightFilterInitialized) {
      setHeightFilter(prev => ({
        ...prev,
        min: globalDataRange.elevation![0],
        max: globalDataRange.elevation![1]
      }))
      setHeightFilterInitialized(true)
    }
  }, [globalDataRange.elevation, heightFilterInitialized])

  // Automatic file search when date range or band type changes
  useEffect(() => {
    // Only search if date range filter is enabled
    if (!dateRangeFilter.enabled) {
      console.log('[App] ℹ️  Date range filter disabled - skipping file search')
      setFoundFiles(null)
      setSelectedFiles([])
      return
    }

    // Perform async file search
    const performSearch = async () => {
      console.log('[App] 🔍 Triggering automatic file search...')
      console.log(`[App] Band: ${selectedBand}, Date range: ${dateRangeFilter.startDate} to ${dateRangeFilter.endDate}`)

      try {
        // Search for files using the file search utility
        // Uses the configured file list from fileSearch.ts
        // In production, replace with API endpoint or S3 listing
        const fileMode: FileMode = 'tiled' // Use tiled mode by default (recommended)
        const result = await searchCalipsoFiles(
          selectedBand,
          dateRangeFilter.startDate,
          dateRangeFilter.endDate,
          {
            fileList: getAvailableFileList(fileMode),
            fileMode
          }
        )

        setFoundFiles(result)

        // Automatically select found files (they will be loaded when spatial filter is applied)
        if (result.files.length > 0) {
          console.log(`[App] ✅ ${result.files.length} files ready for loading`)
          console.log(`[App] 📋 Files stored and ready for spatial filtering`)
          // Don't load files yet - wait for spatial bounds to be applied
        }

      } catch (error) {
        console.error('[App] ❌ File search failed:', error)
        setFoundFiles(null)
      }
    }

    performSearch()
  }, [selectedBand, dateRangeFilter.enabled, dateRangeFilter.startDate, dateRangeFilter.endDate, fileSearchTrigger])

  // Load files ONLY when spatial bounds filter is explicitly applied (counter increments)
  // Clear files when spatial bounds filter is disabled
  useEffect(() => {
    // If spatial bounds filter is disabled, clear files
    if (!spatialBoundsFilter.enabled) {
      if (selectedFiles.length > 0) {
        console.log('[App] 🗑️  Spatial bounds filter disabled - clearing data')
        setSelectedFiles([])
      }
      return
    }

    // Only proceed if counter > 0 (meaning filter was explicitly applied)
    if (spatialFilterApplyCounter === 0) {
      return
    }

    // If enabled, check if we have files to load
    if (!foundFiles || foundFiles.files.length === 0) {
      console.log('[App] ⚠️  Spatial bounds filter applied but no files found to load')
      setSelectedFiles([])
      return
    }

    // Clear old data and load new files with spatial filtering
    console.log('[App] 🔄 Spatial bounds filter APPLIED - loading data')
    console.log('[App] 🗑️  Clearing old data first')
    console.log('[App] 🗺️  Loading files with spatial bounds:')
    console.log(`  • Lon: ${spatialBoundsFilter.minLon.toFixed(2)}° to ${spatialBoundsFilter.maxLon.toFixed(2)}°`)
    console.log(`  • Lat: ${spatialBoundsFilter.minLat.toFixed(2)}° to ${spatialBoundsFilter.maxLat.toFixed(2)}°`)
    console.log(`  • Alt: ${spatialBoundsFilter.minAlt.toFixed(2)} to ${spatialBoundsFilter.maxAlt.toFixed(2)} km`)
    console.log(`[App] 📂 Loading ${foundFiles.files.length} file(s)`)

    // Create a new array reference to force React to recognize the change
    // This ensures PointCloudViewer reloads even if the file list is the same
    setSelectedFiles([...foundFiles.files])

  }, [spatialFilterApplyCounter, spatialBoundsFilter.enabled, foundFiles, selectedFiles.length, spatialBoundsFilter.minLon, spatialBoundsFilter.maxLon, spatialBoundsFilter.minLat, spatialBoundsFilter.maxLat, spatialBoundsFilter.minAlt, spatialBoundsFilter.maxAlt])

  return (
    <div className="app">
      <PointCloudViewer
        files={selectedFiles}
        colorMode={colorMode}
        colormap={colormap}
        pointSize={pointSize}
        viewMode={viewMode}
        onGlobalDataRangeUpdate={handleGlobalDataRangeUpdate}
        onDataRangeUpdate={setDataRange}
        aoiPolygon={aoiPolygon}
        showScatterPlotTrigger={showScatterPlotTrigger}
        onAOIDataReady={handleAOIDataReady}
        onPolygonUpdate={handlePolygonUpdate}
        isDrawingAOI={isDrawingAOI}
        heightFilter={heightFilter}
        spatialBoundsFilter={spatialBoundsFilter}
        isGroundModeActive={isGroundModeActive}
        groundCameraPosition={groundCameraPosition}
        onGroundCameraPositionSet={handleGroundCameraPositionSet}
        testConfigMaxDepth={testConfigMaxDepth}
        testConfigMaxNodes={testConfigMaxNodes}
      />

      <FilterPanel
        selectedBand={selectedBand}
        onBandChange={handleBandChange}
        dateRangeFilter={dateRangeFilter}
        onDateRangeFilterChange={handleDateRangeFilterChange}
        onResetDateRangeFilter={handleResetDateRangeFilter}
        spatialBoundsFilter={spatialBoundsFilter}
        onSpatialBoundsFilterChange={handleSpatialBoundsFilterChange}
        onResetSpatialBoundsFilter={handleResetSpatialBoundsFilter}
        globalDataRange={globalDataRange}
        aoiPolygon={aoiPolygon}
      />

      <ControlPanel
        colorMode={colorMode}
        onColorModeChange={setColorMode}
        colormap={colormap}
        onColormapChange={setColormap}
        pointSize={pointSize}
        onPointSizeChange={setPointSize}
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
        dataRange={dataRange}
        isDrawingAOI={isDrawingAOI}
        onToggleDrawAOI={handleToggleDrawAOI}
        onClearAOI={handleClearAOI}
        onShowScatterPlot={handleShowScatterPlot}
        hasAOI={aoiPolygon !== null && aoiPolygon.length >= 3}
        hasAOIData={hasAOIData}
        aoiPointCount={aoiPointCount}
        isGroundModeActive={isGroundModeActive}
        onToggleGroundMode={handleToggleGroundMode}
        groundCameraPosition={groundCameraPosition}
        onTestConfigSelect={handleTestConfigSelect}
        currentTestId={activeTestConfig}
      />

      <DataInfo dataRange={dataRange} />

      <ControlsInfo />
    </div>
  )
}

export default App
