import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { ColorMode, Colormap, DataRange, ViewMode, HeightFilter, SpatialBoundsFilter } from '../App'
import { COPCLODManager, SpatialBounds, TimeRange } from '../utils/copcLoaderLOD'
import {
  loadCOPCFile,
  loadCOPCFileWithSpatialBounds,
  computeElevationColors,
  computeIntensityColors,
  computeClassificationColors,
  PointCloudData
} from '../utils/copcLoader'
import { convertPointsToGlobe, convertPointsTo2D, haversineDistance, calculateBearing, calculatePointAtDistanceAndBearing } from '../utils/coordinateConversion'
import { LatLon, filterDataByAOI } from '../utils/aoiSelector'
// GlobeViewer removed - 2D mode only
import DeckGLMapView, { DeckGLMapViewHandle } from './DeckGLMapView'
import AOIScatterPlot from './AOIScatterPlot'
import './PointCloudViewer.css'

interface PointCloudViewerProps {
  files: string[]
  colorMode: ColorMode
  colormap: Colormap
  pointSize: number
  viewMode: ViewMode
  onGlobalDataRangeUpdate: (range: DataRange) => void
  onDataRangeUpdate: (range: DataRange) => void
  aoiPolygon: LatLon[] | null
  showScatterPlotTrigger?: boolean
  onAOIDataReady?: (hasData: boolean, pointCount?: number) => void
  onPolygonUpdate?: (polygon: LatLon[]) => void
  isDrawingAOI?: boolean
  heightFilter?: HeightFilter
  spatialBoundsFilter?: SpatialBoundsFilter
  isGroundModeActive?: boolean
  groundCameraPosition?: { lat: number, lon: number } | null
  onGroundCameraPositionSet?: (lat: number, lon: number) => void
  testConfigMaxDepth?: number  // Optional test configuration override
  testConfigMaxNodes?: number  // Optional test configuration override
}

export default function PointCloudViewer({ files, colorMode, colormap, pointSize, viewMode, onGlobalDataRangeUpdate, onDataRangeUpdate, aoiPolygon, showScatterPlotTrigger, onAOIDataReady, onPolygonUpdate, isDrawingAOI, heightFilter, spatialBoundsFilter, isGroundModeActive, groundCameraPosition, onGroundCameraPositionSet, testConfigMaxDepth, testConfigMaxNodes }: PointCloudViewerProps) {
  // const globeRef = useRef<GlobeViewerHandle>(null) // Removed - 2D only
  const deckMapRef = useRef<DeckGLMapViewHandle>(null)
  const pointCloudsRef = useRef<THREE.Points[]>([]) // For 2D mode only
  const dataRef = useRef<PointCloudData[]>([]) // For 2D mode only

  // Track loaded spatial bounds and raw unfiltered data for incremental loading
  const loadedBoundsRef = useRef<SpatialBoundsFilter | null>(null)
  const rawUnfilteredDataRef = useRef<PointCloudData[]>([]) // Complete unfiltered dataset
  const lodManagersRef = useRef<COPCLODManager[]>([]) // For 3D mode with LOD (COPC)
  const lastCameraDistanceRef = useRef<number>(3.0) // Default camera distance
  const animationFrameRef = useRef<number | null>(null)
  const lodUpdateFrameRef = useRef<number | null>(null) // Separate animation frame for LOD updates

  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({ points: 0, files: 0 })
  const [globalRanges, setGlobalRanges] = useState<{
    elevation: [number, number] | null
    intensity: [number, number] | null
  }>({
    elevation: null,
    intensity: null
  })
  const [filteredRanges, setFilteredRanges] = useState<{
    elevation: [number, number] | null
    intensity: [number, number] | null
  }>({
    elevation: null,
    intensity: null
  })
  const [intensityPercentiles, setIntensityPercentiles] = useState<{
    p25: number
    p50: number
    p75: number
    p90: number
  } | null>(null)
  const [currentIntensityThreshold, setCurrentIntensityThreshold] = useState<number | undefined>(undefined)
  const [mapCenter, setMapCenter] = useState<[number, number]>([0, 0])
  const [mapZoom, setMapZoom] = useState<number>(6)
  const [initialCameraDistance, setInitialCameraDistance] = useState<number>(2.5) // Calculated based on data extent
  const [dataLoaded, setDataLoaded] = useState(false)
  const [dataVersion, setDataVersion] = useState(0) // Increment to trigger DeckGLMapView update
  const [mapViewKey, setMapViewKey] = useState(0) // Increment to force DeckGLMapView remount
  const last2DMapStateRef = useRef<{ center: [number, number], zoom: number } | null>(null)
  const last3DCameraStateRef = useRef<{ distance: number, target: { lon: number, lat: number } } | null>(null)
  const lastColorSettingsRef = useRef<{ colorMode: ColorMode, colormap: Colormap } | null>(null)
  const lastViewModeRef = useRef<ViewMode>(viewMode)
  const initialCameraSetRef = useRef(false) // Track if initial camera has been set after data loads
  const heightFilterRebuildInitializedRef = useRef(false) // Track if height filter rebuild effect has run at least once

  // Store decimated data per point cloud for fast color updates
  const decimatedDataRef = useRef<Array<{
    positions: Float32Array
    intensities: Uint16Array
    classifications: Uint8Array
  }>>([])

  // Helper to pause rendering during geometry updates - removed for 2D-only mode
  // const withRenderPause = useCallback(async (operation: () => void | Promise<void>) => {
  //   // 2D mode only - no longer needed
  // }, [])

  // Track 3D camera state - removed for 2D-only mode
  // useEffect(() => {
  //   // 2D mode only - no 3D camera tracking needed
  // }, [viewMode, dataLoaded])

  // Track 2D map state continuously when in 2D mode
  useEffect(() => {
    if (viewMode !== '2d' || !deckMapRef.current) return

    const updateMapState = () => {
      // Skip map state tracking when ground mode is active to avoid interfering with camera animations
      if (isGroundModeActive) {
        console.log(`[PointCloudViewer] Skipping 2D map tracking - ground mode active`)
        return
      }

      if (deckMapRef.current) {
        const mapState = deckMapRef.current.getMapState()
        if (mapState) {
          const prev = last2DMapStateRef.current
          const changed = !prev ||
            Math.abs(prev.center[0] - mapState.center[0]) > 0.001 ||
            Math.abs(prev.center[1] - mapState.center[1]) > 0.001 ||
            Math.abs(prev.zoom - mapState.zoom) > 0.01

          if (changed) {
            console.log(`[PointCloudViewer] 2D map tracking: center (${mapState.center[0].toFixed(4)}, ${mapState.center[1].toFixed(4)}), zoom ${mapState.zoom.toFixed(4)}`)
          }

          last2DMapStateRef.current = { center: mapState.center, zoom: mapState.zoom }
        }
      }
    }

    // Update every 500ms while in 2D mode
    const interval = setInterval(updateMapState, 500)
    updateMapState() // Initial update

    return () => clearInterval(interval)
  }, [viewMode, isGroundModeActive])

  // AOI scatter plot state
  const [showScatterPlot, setShowScatterPlot] = useState(false)
  const [aoiData, setAoiData] = useState<{ altitudes: number[], intensities: number[] } | null>(null)

  // Ground mode view data - enriched with nearest point and bearing for camera positioning
  const [groundModeViewData, setGroundModeViewData] = useState<{
    clickedLat: number
    clickedLon: number
    nearestLat: number
    nearestLon: number
    nearestAlt: number
    distance: number
    bearing: number
    perpendicularBearing: number
  } | null>(null)

  // Get decimation factor based on camera distance from globe center
  const getDecimationForDistance = useCallback((distance: number): number => {
    // Earth radius is 1.0, so distance is from origin
    // LOD pattern matches 2D view: 500, 200, 50, 10, 2, 1
    // When zoomed out (distance > 3): fewer points
    // When zoomed in (distance < 1.5): more points

    if (distance > 5.0) return 500      // Very far: ~9,300 points
    if (distance > 3.5) return 200      // Far: ~23,000 points
    if (distance > 3.0) return 50       // Medium: ~93,000 points
    if (distance > 1.8) return 10       // Close: ~465,000 points
    if (distance > 1.3) return 2        // Very close: ~2.3M points
    return 1                             // At surface: All points (~4.6M)
  }, [])

  // Helper function to filter points by height
  const filterPointsByHeight = useCallback((data: PointCloudData): PointCloudData => {
    // If height filter is disabled, return original data
    if (!heightFilter || !heightFilter.enabled) {
      return data
    }

    const { min, max } = heightFilter
    const filteredIndices: number[] = []

    // Find all points within height range
    for (let i = 0; i < data.positions.length; i += 3) {
      const altitude = data.positions[i + 2] // Z coordinate = altitude in km
      if (altitude >= min && altitude <= max) {
        filteredIndices.push(i / 3) // Store point index (not position index)
      }
    }

    // If no points pass the filter, return empty arrays
    if (filteredIndices.length === 0) {
      return {
        ...data,
        positions: new Float32Array(0),
        colors: new Uint8Array(0),
        intensities: new Uint16Array(0),
        classifications: new Uint8Array(0),
        count: 0
      }
    }

    // Create filtered arrays
    const filteredPositions = new Float32Array(filteredIndices.length * 3)
    const filteredColors = new Uint8Array(filteredIndices.length * 3)
    const filteredIntensities = new Uint16Array(filteredIndices.length)
    const filteredClassifications = new Uint8Array(filteredIndices.length)

    filteredIndices.forEach((pointIndex, newIndex) => {
      // Copy position (3 values per point)
      filteredPositions[newIndex * 3] = data.positions[pointIndex * 3]
      filteredPositions[newIndex * 3 + 1] = data.positions[pointIndex * 3 + 1]
      filteredPositions[newIndex * 3 + 2] = data.positions[pointIndex * 3 + 2]

      // Copy color (3 values per point)
      filteredColors[newIndex * 3] = data.colors[pointIndex * 3]
      filteredColors[newIndex * 3 + 1] = data.colors[pointIndex * 3 + 1]
      filteredColors[newIndex * 3 + 2] = data.colors[pointIndex * 3 + 2]

      // Copy intensity (1 value per point)
      filteredIntensities[newIndex] = data.intensities[pointIndex]

      // Copy classification (1 value per point)
      filteredClassifications[newIndex] = data.classifications[pointIndex]
    })

    return {
      ...data,
      positions: filteredPositions,
      colors: filteredColors,
      intensities: filteredIntensities,
      classifications: filteredClassifications,
      count: filteredIndices.length
    }
  }, [heightFilter])

  // Find nearest point in the point cloud to a given lat/lon position
  const findNearestPoint = useCallback((targetLat: number, targetLon: number): {
    lat: number
    lon: number
    alt: number
    distance: number
    bearing: number
    index: number
  } | null => {
    let minDistance = Infinity
    let nearestPoint = null

    // Search through all loaded datasets
    dataRef.current.forEach((data, datasetIndex) => {
      // Iterate through positions (interleaved: lon, lat, alt, lon, lat, alt, ...)
      for (let i = 0; i < data.positions.length; i += 3) {
        const lon = data.positions[i]
        const lat = data.positions[i + 1]
        const alt = data.positions[i + 2]

        // Calculate distance using haversine formula
        const distance = haversineDistance(targetLat, targetLon, lat, lon)

        if (distance < minDistance) {
          minDistance = distance
          nearestPoint = {
            lat,
            lon,
            alt,
            distance,
            bearing: 0, // Will calculate after finding nearest
            index: i / 3,
            datasetIndex
          }
        }
      }
    })

    if (nearestPoint) {
      // Calculate bearing from clicked position to nearest point
      nearestPoint.bearing = calculateBearing(targetLat, targetLon, nearestPoint.lat, nearestPoint.lon)
      console.log(`[PointCloudViewer] Found nearest point: distance=${nearestPoint.distance.toFixed(2)}km, bearing=${nearestPoint.bearing.toFixed(1)}°, altitude=${nearestPoint.alt.toFixed(2)}km`)
    }

    return nearestPoint
  }, [])

  // Handle ground mode click - find nearest point and calculate camera positioning
  const handleGroundModeClick = useCallback((lat: number, lon: number) => {
    console.log(`[PointCloudViewer] Ground mode click at: (${lat.toFixed(4)}, ${lon.toFixed(4)})`)

    // Find nearest point in the data
    const nearest = findNearestPoint(lat, lon)

    if (nearest) {
      // Use direct bearing from clicked ground position to nearest data point
      // This makes the camera look directly at the data from the ground viewpoint
      const viewBearing = nearest.bearing

      console.log(`[PointCloudViewer] Ground mode data:`)
      console.log(`  Clicked position: (${lat.toFixed(4)}, ${lon.toFixed(4)})`)
      console.log(`  Nearest data point: (${nearest.lat.toFixed(4)}, ${nearest.lon.toFixed(4)}) at ${nearest.alt.toFixed(2)}km altitude`)
      console.log(`  Distance to nearest: ${nearest.distance.toFixed(1)}km`)
      console.log(`  Camera bearing (looking at data): ${viewBearing.toFixed(1)}°`)

      // Calculate camera position 10km from nearest point
      const distanceFromData = 10 // km
      const reverseBearing = (nearest.bearing + 180) % 360
      const cameraPos = calculatePointAtDistanceAndBearing(
        nearest.lat,
        nearest.lon,
        distanceFromData,
        reverseBearing
      )

      console.log(`[PointCloudViewer] 🎯 Updating map center/zoom state for ground mode:`)
      console.log(`  New center: (${cameraPos.lat.toFixed(6)}, ${cameraPos.lon.toFixed(6)})`)
      console.log(`  New zoom: 9`)

      // Update the map center and zoom state so flyTo won't be overridden
      // MapLibre expects [longitude, latitude] order
      setMapCenter([cameraPos.lon, cameraPos.lat])
      setMapZoom(9)

      // Set enriched ground mode view data for DeckGLMapView
      setGroundModeViewData({
        clickedLat: lat,
        clickedLon: lon,
        nearestLat: nearest.lat,
        nearestLon: nearest.lon,
        nearestAlt: nearest.alt,
        distance: nearest.distance,
        bearing: nearest.bearing,
        perpendicularBearing: viewBearing  // Use direct bearing to look at data
      })
    }

    // Also call the original callback to update App state
    if (onGroundCameraPositionSet) {
      onGroundCameraPositionSet(lat, lon)
    }
  }, [findNearestPoint, onGroundCameraPositionSet])

  // Handle zoom-based intensity threshold changes for progressive loading
  const handleZoomThresholdChange = useCallback((threshold: number | undefined) => {
    console.log(`[PointCloudViewer] 🎚️  Zoom threshold changed: ${threshold !== undefined ? threshold.toFixed(3) + ' km⁻¹·sr⁻¹' : 'None (all points)'}`)
    console.log(`[PointCloudViewer] 🔄 Progressive loading will filter points client-side`)
    setCurrentIntensityThreshold(threshold)
  }, [])

  // Update globe LOD based on camera distance - removed for 2D-only mode
  const updateGlobeLOD = useCallback(() => {
    // 2D mode only - no globe LOD needed
    return
  }, [])

  // Fast color-only update for 3D view - removed for 2D-only mode
  const updateColors3D = useCallback(() => {
    // 2D mode only - no 3D color updates needed
    return
  }, [])

  // Start monitoring camera distance for LOD updates - removed for 2D-only mode
  // useEffect(() => {
  //   // 2D mode only - no LOD monitoring needed
  // }, [viewMode, updateGlobeLOD])

  // Filter points by intensity threshold for progressive loading
  const filterPointsByIntensity = useCallback((data: PointCloudData, threshold: number | undefined): PointCloudData => {
    if (threshold === undefined) {
      return data // No filtering
    }

    // Filter points based on intensity threshold
    const filteredPositions: number[] = []
    const filteredColors: number[] = []
    const filteredIntensities: number[] = []
    const filteredClassifications: number[] = []

    for (let i = 0; i < data.intensities.length; i++) {
      const lasIntensity = data.intensities[i]
      const physicalIntensity = (lasIntensity / 10000.0) - 0.1

      if (physicalIntensity >= threshold) {
        // Include this point
        filteredPositions.push(data.positions[i * 3], data.positions[i * 3 + 1], data.positions[i * 3 + 2])
        filteredColors.push(data.colors[i * 3], data.colors[i * 3 + 1], data.colors[i * 3 + 2])
        filteredIntensities.push(data.intensities[i])
        filteredClassifications.push(data.classifications[i])
      }
    }

    return {
      positions: new Float32Array(filteredPositions),
      colors: new Uint8Array(filteredColors),
      intensities: new Uint16Array(filteredIntensities),
      classifications: new Uint8Array(filteredClassifications),
      bounds: data.bounds,
      firstPoint: data.firstPoint,
      lastPoint: data.lastPoint
    }
  }, [])

  // Memoized filtered data for 2D map view
  // Uses dataVersion as dependency since dataRef.current changes don't trigger re-renders
  const filteredDataForMap = useMemo(() => {
    return dataRef.current.map(data => {
      // First apply height filter
      const heightFiltered = filterPointsByHeight(data)
      // Then apply intensity threshold filter
      return filterPointsByIntensity(heightFiltered, currentIntensityThreshold)
    })
  }, [dataVersion, heightFilter, filterPointsByHeight, currentIntensityThreshold, filterPointsByIntensity])

  // Helper function to compute ranges from point cloud data
  const computeRangesFromData = useCallback((dataArray: PointCloudData[]): DataRange => {
    if (dataArray.length === 0) {
      return { elevation: null, intensity: null }
    }

    let minElev = Infinity
    let maxElev = -Infinity
    let minIntPhysical = Infinity
    let maxIntPhysical = -Infinity

    dataArray.forEach((data) => {
      // Elevation range from positions (Z coordinate = altitude in km)
      for (let i = 0; i < data.positions.length; i += 3) {
        const alt = data.positions[i + 2]
        minElev = Math.min(minElev, alt)
        maxElev = Math.max(maxElev, alt)
      }

      // Intensity range - convert from LAS encoding to physical units
      // CALIPSO encoding: intensity = (physical + 0.1) * 10000
      for (let i = 0; i < data.intensities.length; i++) {
        const lasIntensity = data.intensities[i]
        const physical = (lasIntensity / 10000.0) - 0.1
        minIntPhysical = Math.min(minIntPhysical, physical)
        maxIntPhysical = Math.max(maxIntPhysical, physical)
      }
    })

    // Handle case where no valid data
    if (minElev === Infinity || maxElev === -Infinity) {
      return { elevation: null, intensity: null }
    }

    return {
      elevation: [minElev, maxElev] as [number, number],
      intensity: [minIntPhysical, maxIntPhysical] as [number, number]
    }
  }, [])

  // Function to compute ranges from filtered data
  const computeFilteredRanges = useCallback(() => {
    if (!heightFilter || !heightFilter.enabled || dataRef.current.length === 0) {
      // If filter is off, use global ranges
      console.log('[PointCloudViewer] Height filter disabled - using global ranges for colormap')
      setFilteredRanges(globalRanges)
      onDataRangeUpdate(globalRanges)
      return
    }

    console.log(`[PointCloudViewer] 📏 Height filter active (${heightFilter.min.toFixed(2)} - ${heightFilter.max.toFixed(2)} km) - recalculating ranges...`)

    // Apply height filter and calculate ranges from the result
    const heightFilteredData = dataRef.current.map(data => filterPointsByHeight(data))
    const ranges = computeRangesFromData(heightFilteredData)

    // Handle case where no points pass the filter
    if (!ranges.elevation || !ranges.intensity) {
      console.log('[PointCloudViewer] ⚠️  No points pass height filter - using fallback ranges')
      const fallbackRanges = {
        elevation: heightFilter ? [heightFilter.min, heightFilter.max] as [number, number] : null,
        intensity: null
      }
      setFilteredRanges(fallbackRanges)
      onDataRangeUpdate(fallbackRanges)
      return
    }

    console.log(`[PointCloudViewer] 📊 Recalculated ranges from height-filtered data:`)
    console.log(`  • Elevation: ${ranges.elevation[0].toFixed(2)} to ${ranges.elevation[1].toFixed(2)} km`)
    console.log(`  • Intensity: ${ranges.intensity[0].toFixed(3)} to ${ranges.intensity[1].toFixed(3)} km⁻¹·sr⁻¹`)
    console.log(`  🎨 Colormap will be rescaled to these height-filtered ranges`)

    setFilteredRanges(ranges)
    onDataRangeUpdate(ranges)
  }, [heightFilter, filterPointsByHeight, globalRanges, onDataRangeUpdate, computeRangesFromData])

  // Update filtered ranges when height filter changes (for both 2D and 3D views)
  useEffect(() => {
    if (!dataLoaded || dataRef.current.length === 0) return

    console.log('[PointCloudViewer] Height filter or data changed, recomputing filtered ranges')
    computeFilteredRanges()
  }, [heightFilter, dataLoaded, computeFilteredRanges])

  // Helper function: Check if new bounds are within previously loaded bounds
  const boundsWithinLoaded = useCallback((newBounds: SpatialBoundsFilter, loadedBounds: SpatialBoundsFilter | null): boolean => {
    if (!loadedBounds) return false

    return (
      newBounds.minLon >= loadedBounds.minLon &&
      newBounds.maxLon <= loadedBounds.maxLon &&
      newBounds.minLat >= loadedBounds.minLat &&
      newBounds.maxLat <= loadedBounds.maxLat &&
      newBounds.minAlt >= loadedBounds.minAlt &&
      newBounds.maxAlt <= loadedBounds.maxAlt
    )
  }, [])

  // Helper function: Apply client-side spatial filtering to existing data
  const filterDataClientSide = useCallback((
    data: PointCloudData[],
    bounds: SpatialBoundsFilter
  ): PointCloudData[] => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('[PointCloudViewer] 🎯 CLIENT-SIDE FILTERING')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  • Filtering existing data with new bounds`)
    console.log(`  • Lon: ${bounds.minLon.toFixed(2)}° to ${bounds.maxLon.toFixed(2)}°`)
    console.log(`  • Lat: ${bounds.minLat.toFixed(2)}° to ${bounds.maxLat.toFixed(2)}°`)
    console.log(`  • Alt: ${bounds.minAlt.toFixed(2)} to ${bounds.maxAlt.toFixed(2)} km`)

    return data.map(dataset => {
      const filteredIndices: number[] = []
      const pointCount = dataset.positions.length / 3

      // Find points within bounds
      for (let i = 0; i < pointCount; i++) {
        const x = dataset.positions[i * 3]     // lon
        const y = dataset.positions[i * 3 + 1] // lat
        const z = dataset.positions[i * 3 + 2] // alt

        if (x >= bounds.minLon && x <= bounds.maxLon &&
            y >= bounds.minLat && y <= bounds.maxLat &&
            z >= bounds.minAlt && z <= bounds.maxAlt) {
          filteredIndices.push(i)
        }
      }

      const filteredCount = filteredIndices.length
      console.log(`  📊 Filtered ${filteredCount}/${pointCount} points (${(filteredCount/pointCount*100).toFixed(1)}%)`)

      // Create filtered arrays
      const positions = new Float32Array(filteredCount * 3)
      const intensities = new Uint16Array(filteredCount)
      const classifications = new Uint8Array(filteredCount)
      const gpsTimes = new Float64Array(filteredCount)
      const colors = new Uint8Array(filteredCount * 3)

      // Copy filtered points
      filteredIndices.forEach((origIndex, newIndex) => {
        positions[newIndex * 3] = dataset.positions[origIndex * 3]
        positions[newIndex * 3 + 1] = dataset.positions[origIndex * 3 + 1]
        positions[newIndex * 3 + 2] = dataset.positions[origIndex * 3 + 2]
        intensities[newIndex] = dataset.intensities[origIndex]
        classifications[newIndex] = dataset.classifications[origIndex]
        gpsTimes[newIndex] = dataset.gpsTimes[origIndex]
        if (dataset.colors) {
          colors[newIndex * 3] = dataset.colors[origIndex * 3]
          colors[newIndex * 3 + 1] = dataset.colors[origIndex * 3 + 1]
          colors[newIndex * 3 + 2] = dataset.colors[origIndex * 3 + 2]
        }
      })

      // Recalculate bounds
      let minX = Infinity, minY = Infinity, minZ = Infinity
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
      for (let i = 0; i < filteredCount; i++) {
        const x = positions[i * 3]
        const y = positions[i * 3 + 1]
        const z = positions[i * 3 + 2]
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        minZ = Math.min(minZ, z)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
        maxZ = Math.max(maxZ, z)
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

      return {
        positions,
        intensities,
        classifications,
        gpsTimes,
        colors,
        pointCount: filteredCount,
        bounds: {
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ]
        }
      }
    })
  }, [])

  // Globe viewer is initialized by the GlobeViewer component

  // Helper function to load files with LOD manager - removed for 2D-only mode
  const loadWithLODManager = useCallback(async () => {
    // 2D mode only - LOD manager not needed
    setError('LOD manager not available in 2D-only mode')
    setLoading(false)
    return
  }, [setError, setLoading])

  // Load Potree files
  useEffect(() => {
    if (files.length === 0) {
      // Clean up Potree LOD managers
      lodManagersRef.current.forEach(m => m.dispose())
      lodManagersRef.current = []

      // Clean up simple loader data - removed for 2D-only mode
      // 2D mode only - no THREE.js cleanup needed
      pointCloudsRef.current = []
      dataRef.current = []

      setLoading(false)
      setDataLoaded(false)
      setError(null)
      return
    }

    // Clean up existing LOD managers before loading new ones
    lodManagersRef.current.forEach(m => m.dispose())
    lodManagersRef.current = []

    // Clean up existing point clouds - removed for 2D-only mode
    // 2D mode only - no THREE.js cleanup needed

    // Clear data references
    pointCloudsRef.current = []
    dataRef.current = []

    setLoading(true)
    setError(null)
    setLoadingProgress(0)

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INCREMENTAL LOADING OPTIMIZATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // Check if we can reuse existing data with client-side filtering
    // instead of re-fetching from server

    const canUseClientSideFilter = (
      spatialBoundsFilter?.enabled &&
      loadedBoundsRef.current !== null &&
      rawUnfilteredDataRef.current.length > 0 &&
      boundsWithinLoaded(spatialBoundsFilter, loadedBoundsRef.current)
    )

    if (canUseClientSideFilter && spatialBoundsFilter) {
      console.log('╔═══════════════════════════════════════════════════════════╗')
      console.log('║         ⚡ FAST CLIENT-SIDE FILTERING (NO RE-FETCH)      ║')
      console.log('╚═══════════════════════════════════════════════════════════╝')
      console.log(`[PointCloudViewer] ✨ New bounds are within loaded data - using client-side filter!`)
      console.log(`  Previous: Lon [${loadedBoundsRef.current!.minLon.toFixed(2)}°, ${loadedBoundsRef.current!.maxLon.toFixed(2)}°]`)
      console.log(`  New:      Lon [${spatialBoundsFilter.minLon.toFixed(2)}°, ${spatialBoundsFilter.maxLon.toFixed(2)}°]`)
      console.log(`  ⚡ Skipping server fetch - filtering ${rawUnfilteredDataRef.current[0]?.pointCount || 0} loaded points...\n`)

      // Apply client-side filter to existing data
      const filteredData = filterDataClientSide(rawUnfilteredDataRef.current, spatialBoundsFilter)
      dataRef.current = filteredData

      // Recalculate ranges from the spatially filtered data
      const newRanges = computeRangesFromData(filteredData)
      console.log(`[PointCloudViewer] 📊 Recalculated ranges from filtered data:`)
      if (newRanges.elevation) {
        console.log(`  • Elevation: ${newRanges.elevation[0].toFixed(2)} to ${newRanges.elevation[1].toFixed(2)} km`)
      }
      if (newRanges.intensity) {
        console.log(`  • Intensity: ${newRanges.intensity[0].toFixed(3)} to ${newRanges.intensity[1].toFixed(3)} km⁻¹·sr⁻¹`)
      }

      // Update ranges - this will rescale the colormap
      setGlobalRanges(newRanges)
      setFilteredRanges(newRanges)
      onGlobalDataRangeUpdate(newRanges)
      onDataRangeUpdate(newRanges)

      // Recompute colors with new ranges
      filteredData.forEach((data) => {
        switch (colorMode) {
          case 'elevation':
            if (newRanges.elevation) {
              computeElevationColors(
                data.positions,
                data.colors,
                newRanges.elevation[0],
                newRanges.elevation[1],
                colormap
              )
            }
            break
          case 'intensity':
            if (newRanges.intensity) {
              computeIntensityColors(
                data.intensities,
                data.colors,
                newRanges.intensity[0],
                newRanges.intensity[1],
                colormap,
                true // Use CALIPSO scaling
              )
            }
            break
          case 'classification':
            computeClassificationColors(data.classifications, data.colors)
            break
        }
      })

      // Update display immediately
      setLoading(false)
      setDataLoaded(true)
      setDataVersion(prev => prev + 1)

      // Calculate stats
      let totalPoints = 0
      filteredData.forEach(data => {
        totalPoints += data.positions.length / 3
      })
      setStats({ points: totalPoints, files: filteredData.length })

      console.log(`[PointCloudViewer] ✅ Client-side filtering complete - ${totalPoints.toLocaleString()} points displayed`)
      console.log(`[PointCloudViewer] 🎨 Colormap rescaled to filtered data range`)
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      return
    }

    // If we reach here, we need to fetch from server
    // (either first load, or bounds expanded beyond loaded data)

    // Log file loading with filter context
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║         📂 LOADING COPC FILES WITH ACTIVE FILTERS         ║')
    console.log('╚═══════════════════════════════════════════════════════════╝')
    console.log(`[PointCloudViewer] 📁 Loading ${files.length} file(s):`)
    files.forEach((file, idx) => {
      const filename = file.split('/').pop() || file
      console.log(`  ${idx + 1}. ${filename}`)
    })

    if (spatialBoundsFilter?.enabled) {
      console.log(`\n[PointCloudViewer] 🗺️  Active filters will be applied:`)
      console.log(`  ✓ Spatial Bounds Filter: ENABLED`)
      console.log(`    • Lon: ${spatialBoundsFilter.minLon.toFixed(2)}° to ${spatialBoundsFilter.maxLon.toFixed(2)}°`)
      console.log(`    • Lat: ${spatialBoundsFilter.minLat.toFixed(2)}° to ${spatialBoundsFilter.maxLat.toFixed(2)}°`)
      console.log(`    • Alt: ${spatialBoundsFilter.minAlt.toFixed(2)} to ${spatialBoundsFilter.maxAlt.toFixed(2)} km`)
      console.log(`\n[PointCloudViewer] ⚡ COPC Octree Optimization:`)
      console.log(`  • Using COPC format for efficient spatial filtering`)
      console.log(`  • HTTP Range requests will fetch ONLY necessary octree nodes`)
      console.log(`  • This avoids loading the entire file into memory!`)
      console.log(`  • Note: Full spatial-filtered COPC loading will be completed in future update`)
    } else {
      console.log(`\n[PointCloudViewer] ℹ️  Spatial Bounds Filter: DISABLED (loading all visible data)`)
    }

    if (heightFilter?.enabled) {
      console.log(`  ✓ Height Filter: ${heightFilter.min.toFixed(2)} to ${heightFilter.max.toFixed(2)} km`)
    }

    console.log('╚═══════════════════════════════════════════════════════════╝\n')

    // Load all files using COPC format
    Promise.all(
      files.map((file, index) =>
        loadCOPCFileWithSpatialBounds(
          file,
          spatialBoundsFilter?.enabled ? {
            minLon: spatialBoundsFilter.minLon,
            maxLon: spatialBoundsFilter.maxLon,
            minLat: spatialBoundsFilter.minLat,
            maxLat: spatialBoundsFilter.maxLat,
            minAlt: spatialBoundsFilter.minAlt,
            maxAlt: spatialBoundsFilter.maxAlt
          } : undefined,
          (progress) => {
            setLoadingProgress((prev) => {
              const fileProgress = progress / files.length
              const previousFilesProgress = index / files.length
              return Math.min(100, (previousFilesProgress + fileProgress) * 100)
            })
          },
          undefined, // intensityThreshold
          spatialBoundsFilter?.enabled && spatialBoundsFilter?.useAOIBounds ? aoiPolygon : null, // Pass AOI polygon when using AOI bounds
          testConfigMaxDepth, // Test config max depth override
          testConfigMaxNodes  // Test config max nodes override
        )
      )
    )
      .then((loadedData) => {
        // Filter out empty results (tiles with no points)
        const allData = loadedData.filter(data =>
          data && data.positions && data.positions.length > 0
        )

        console.log(`[PointCloudViewer] 📊 Filtered results: ${allData.length} of ${loadedData.length} tiles have data`)

        dataRef.current = allData

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // CAPTURE INTENSITY PERCENTILES FOR PROGRESSIVE LOADING
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Extract intensity percentiles from the first file (they should all have similar distributions)
        const firstFilePercentiles = allData[0]?.intensityPercentiles
        if (firstFilePercentiles) {
          setIntensityPercentiles(firstFilePercentiles)
          console.log(`[PointCloudViewer] 📊 Captured intensity percentiles for progressive loading:`)
          console.log(`  • 25th percentile: ${firstFilePercentiles.p25.toFixed(3)} km⁻¹·sr⁻¹`)
          console.log(`  • 50th percentile: ${firstFilePercentiles.p50.toFixed(3)} km⁻¹·sr⁻¹`)
          console.log(`  • 75th percentile: ${firstFilePercentiles.p75.toFixed(3)} km⁻¹·sr⁻¹`)
          console.log(`  • 90th percentile: ${firstFilePercentiles.p90.toFixed(3)} km⁻¹·sr⁻¹`)
        }

        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // SAVE LOADED DATA FOR INCREMENTAL LOADING
        // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        // Store raw unfiltered data and bounds so we can do client-side
        // filtering later without re-fetching from server

        rawUnfilteredDataRef.current = allData
        loadedBoundsRef.current = spatialBoundsFilter || null

        if (spatialBoundsFilter) {
          console.log(`[PointCloudViewer] 💾 Cached loaded data with bounds:`)
          console.log(`  Lon: ${spatialBoundsFilter.minLon.toFixed(2)}° to ${spatialBoundsFilter.maxLon.toFixed(2)}°`)
          console.log(`  Lat: ${spatialBoundsFilter.minLat.toFixed(2)}° to ${spatialBoundsFilter.maxLat.toFixed(2)}°`)
          console.log(`  Alt: ${spatialBoundsFilter.minAlt.toFixed(2)} to ${spatialBoundsFilter.maxAlt.toFixed(2)} km`)
          console.log(`  ⚡ Future bounds changes within this range will use client-side filtering!\n`)
        }

        // Compute global ranges across all files
        let minElev = Infinity
        let maxElev = -Infinity
        let minIntPhysical = Infinity
        let maxIntPhysical = -Infinity

        allData.forEach((data) => {
          // Skip if data is invalid or empty
          if (!data || !data.positions || !data.intensities) {
            console.warn('[PointCloudViewer] ⚠️  Skipping invalid data entry:', data)
            return
          }

          // Elevation range from positions (Z coordinate = altitude in km)
          if (data.positions.length > 0) {
            for (let i = 0; i < data.positions.length; i += 3) {
              const alt = data.positions[i + 2]
              minElev = Math.min(minElev, alt)
              maxElev = Math.max(maxElev, alt)
            }
          }

          // Intensity range - convert from LAS encoding to physical units
          // CALIPSO encoding: intensity = (physical + 0.1) * 10000
          // Physical units: km⁻¹·sr⁻¹
          if (data.intensities.length > 0) {
            for (let i = 0; i < data.intensities.length; i++) {
              const lasIntensity = data.intensities[i]
              const physical = (lasIntensity / 10000.0) - 0.1
              minIntPhysical = Math.min(minIntPhysical, physical)
              maxIntPhysical = Math.max(maxIntPhysical, physical)
            }
          }
        })

        const ranges = {
          elevation: [minElev, maxElev] as [number, number],
          intensity: [minIntPhysical, maxIntPhysical] as [number, number]
        }

        // Log the calculated ranges (especially important when spatial filtering is active)
        console.log(`[PointCloudViewer] 📊 Calculated data ranges from loaded data:`)
        console.log(`  • Elevation: ${ranges.elevation[0].toFixed(2)} to ${ranges.elevation[1].toFixed(2)} km`)
        console.log(`  • Intensity: ${ranges.intensity[0].toFixed(3)} to ${ranges.intensity[1].toFixed(3)} km⁻¹·sr⁻¹`)
        if (spatialBoundsFilter?.enabled) {
          console.log(`  ℹ️  These ranges reflect the SPATIALLY FILTERED data`)
          console.log(`  🎨 Colormap will be scaled to these filtered ranges`)
        }

        setGlobalRanges(ranges)
        setFilteredRanges(ranges) // Initially, filtered ranges = global ranges
        onGlobalDataRangeUpdate(ranges) // Set the global data range that never changes
        onDataRangeUpdate(ranges) // Set the current data range

        // Compute colors for original data (needed for 2D view)
        allData.forEach((data) => {
          switch (colorMode) {
            case 'elevation':
              computeElevationColors(
                data.positions,
                data.colors,
                ranges.elevation[0],
                ranges.elevation[1],
                colormap
              )
              break
            case 'intensity':
              computeIntensityColors(
                data.intensities,
                data.colors,
                ranges.intensity[0],
                ranges.intensity[1],
                colormap,
                true // Use CALIPSO scaling
              )
              break
            case 'classification':
              computeClassificationColors(data.classifications, data.colors)
              break
          }
        })

        // Calculate map center from first file's data
        let minLng = Infinity, maxLng = -Infinity
        let minLat = Infinity, maxLat = -Infinity
        for (let i = 0; i < allData[0].positions.length; i += 3) {
          const lon = allData[0].positions[i]
          const lat = allData[0].positions[i + 1]
          minLng = Math.min(minLng, lon)
          maxLng = Math.max(maxLng, lon)
          minLat = Math.min(minLat, lat)
          maxLat = Math.max(maxLat, lat)
        }
        const centerLng = (minLng + maxLng) / 2
        const centerLat = (minLat + maxLat) / 2

        // Calculate extent in degrees
        const extentLng = maxLng - minLng
        const extentLat = maxLat - minLat

        // Use fixed distance of 1.8 for best detail (decimation 1:2, ~2.3M points)
        const calculatedDistance = 1.8

        // Always recenter and zoom to level 9 when data is loaded
        // Clear last map state to force recenter
        last2DMapStateRef.current = null
        const dataZoom = 9

        console.log(`[PointCloudViewer] 🎯 Data loaded - centering at (${centerLng.toFixed(4)}, ${centerLat.toFixed(4)}), zoom ${dataZoom}`)
        console.log(`[PointCloudViewer] Data extent: ${extentLng.toFixed(2)}° lng × ${extentLat.toFixed(2)}° lat`)

        setMapCenter([centerLng, centerLat])
        setMapZoom(dataZoom)
        setInitialCameraDistance(calculatedDistance)

        // For 2D mode: Data is already stored in dataRef, just update loading states
        console.log(`[PointCloudViewer] 📍 2D mode: Data loaded, skipping THREE.js geometry creation`)
        setLoading(false)
        setDataLoaded(true)
        setDataVersion(prev => prev + 1)

        // Calculate stats from raw data for 2D mode
        let totalPoints = 0
        allData.forEach(data => {
          totalPoints += data.positions.length / 3
        })
        setStats({ points: totalPoints, files: allData.length })
      })
      .catch((err) => {
        console.error('Error loading COPC files:', err)
        setError(err.message || 'Failed to load COPC files')
        setLoading(false)
      })
  }, [files, pointSize, onGlobalDataRangeUpdate, onDataRangeUpdate, viewMode, colorMode, colormap, spatialBoundsFilter, testConfigMaxDepth, testConfigMaxNodes])

  // Update LOD managers when spatial bounds filter changes
  useEffect(() => {
    if (lodManagersRef.current.length === 0) return

    if (spatialBoundsFilter?.enabled) {
      console.log('[PointCloudViewer] Updating LOD managers with spatial bounds filter')
      const bounds: SpatialBounds = {
        enabled: true,
        minLon: spatialBoundsFilter.minLon,
        maxLon: spatialBoundsFilter.maxLon,
        minLat: spatialBoundsFilter.minLat,
        maxLat: spatialBoundsFilter.maxLat,
        minAlt: spatialBoundsFilter.minAlt,
        maxAlt: spatialBoundsFilter.maxAlt
      }
      lodManagersRef.current.forEach(manager => {
        manager.setSpatialBounds(bounds)
      })
    } else {
      console.log('[PointCloudViewer] Disabling spatial bounds filter on LOD managers')
      lodManagersRef.current.forEach(manager => {
        manager.setSpatialBounds(null)
      })
    }
  }, [spatialBoundsFilter])

  // LOD Manager Update Loop - removed for 2D-only mode
  useEffect(() => {
    // 2D mode only - no LOD manager needed
    return
  }, [viewMode, dataLoaded])

  // Reposition camera - removed for 2D-only mode
  // useEffect(() => {
  //   // 2D mode only - no camera repositioning needed
  // }, [dataLoaded, mapCenter, viewMode, initialCameraDistance])

  // Rebuild point clouds when height filter changes - removed for 2D-only mode
  useEffect(() => {
    // 2D mode only - no point cloud rebuilding needed
    return
  }, [heightFilter])

  // Update colors when color mode or colormap changes
  useEffect(() => {
    if (!globalRanges.elevation || !globalRanges.intensity) return

    // Check if colors actually changed (not just viewMode)
    const colorSettingsChanged = !lastColorSettingsRef.current ||
      lastColorSettingsRef.current.colorMode !== colorMode ||
      lastColorSettingsRef.current.colormap !== colormap

    // Check if we just switched TO 3D view from 2D
    const switchedTo3D = lastViewModeRef.current === '2d' && viewMode !== '2d'

    // Update the color settings ref (viewMode ref is managed by view mode change effect)
    lastColorSettingsRef.current = { colorMode, colormap }

    if (viewMode === '2d') {
      // For 2D view, just update the data and increment dataVersion
      // The 2D map will pick up the new colors from dataRef.current

      // Use filtered ranges if height filter is enabled, otherwise use global ranges
      const activeRanges = (heightFilter?.enabled && filteredRanges.elevation && filteredRanges.intensity)
        ? filteredRanges
        : globalRanges

      console.log('[PointCloudViewer] Updating colors for 2D view, colorMode:', colorMode, 'using ranges:', activeRanges)

      dataRef.current.forEach((data, index) => {
        const colors = data.colors

        switch (colorMode) {
          case 'elevation':
            computeElevationColors(
              data.positions,
              colors,
              activeRanges.elevation![0],
              activeRanges.elevation![1],
              colormap
            )
            break
          case 'intensity':
            computeIntensityColors(
              data.intensities,
              colors,
              activeRanges.intensity![0],
              activeRanges.intensity![1],
              colormap,
              true  // Enable CALIPSO scaling
            )
            break
          case 'classification':
            computeClassificationColors(data.classifications, colors)
            break
        }

        console.log(`[PointCloudViewer] Updated colors for dataset ${index}, sample:`, [colors[0], colors[1], colors[2]])
      })

      // Increment dataVersion to notify DeckGLMapView that colors have changed
      setDataVersion(prev => prev + 1)
    } else if (colorSettingsChanged || switchedTo3D) {
      // For 3D view, use fast color-only update if:
      // 1. Colors actually changed, OR
      // 2. We just switched to 3D view (to ensure colors are applied)
      const reason = switchedTo3D ? 'switched to 3D view' : 'color/colormap changed'
      console.log(`[PointCloudViewer] ${reason} in 3D view - fast color update`)

      // Update LOD managers
      if (lodManagersRef.current.length > 0) {
        lodManagersRef.current.forEach(manager => {
          manager.setColorMode(colorMode, colormap)
        })
      }

      // Update simple loader point clouds (fallback)
      updateColors3D()
    }
  }, [colorMode, colormap, globalRanges, filteredRanges, heightFilter, filterPointsByHeight, viewMode, updateColors3D])

  // Update point size for globe view (2D handled by DeckGLMapView props)
  useEffect(() => {
    if (viewMode !== '2d') {
      // Update LOD managers (3D with octree optimization)
      if (lodManagersRef.current.length > 0) {
        lodManagersRef.current.forEach(manager => {
          manager.setPointSize(pointSize * 0.002)
        })
      }

      // Update simple loader point clouds (fallback/2D)
      pointCloudsRef.current.forEach((pc) => {
        if (pc.material instanceof THREE.PointsMaterial) {
          pc.material.size = pointSize * 0.002
          pc.material.needsUpdate = true
        }
      })
    }
  }, [pointSize, viewMode])

  // Set drawing mode on DeckGLMapView (2D only)
  useEffect(() => {
    if (deckMapRef.current && isDrawingAOI !== undefined) {
      deckMapRef.current.setDrawingMode(isDrawingAOI)
    }
  }, [isDrawingAOI])

  // Clear polygon visualization when aoiPolygon is cleared (2D only)
  useEffect(() => {
    if (deckMapRef.current && aoiPolygon === null) {
      deckMapRef.current.clearPolygon()
    }
  }, [aoiPolygon])

  // Handle polygon complete callback
  const handlePolygonComplete = useCallback((polygon: LatLon[]) => {
    onPolygonUpdate?.(polygon)
  }, [onPolygonUpdate])

  // Filter data when AOI polygon changes or height filter changes
  useEffect(() => {
    if (!aoiPolygon || aoiPolygon.length < 3) {
      setAoiData(null)
      onAOIDataReady?.(false, 0)
      return
    }

    // Filter all loaded data by the polygon and height filter
    let allAltitudes: number[] = []
    let allIntensities: number[] = []

    dataRef.current.forEach(data => {
      // First apply height filter if enabled
      const heightFilteredData = filterPointsByHeight(data)

      // Then apply AOI polygon filter to the height-filtered data
      const filtered = filterDataByAOI(heightFilteredData.positions, heightFilteredData.intensities, aoiPolygon)
      allAltitudes = [...allAltitudes, ...filtered.altitudes]
      allIntensities = [...allIntensities, ...filtered.intensities]
    })

    const hasData = allAltitudes.length > 0
    const pointCount = allAltitudes.length
    setAoiData(hasData ? { altitudes: allAltitudes, intensities: allIntensities } : null)
    onAOIDataReady?.(hasData, pointCount)
  }, [aoiPolygon, onAOIDataReady, heightFilter, filterPointsByHeight])

  // Show scatter plot when triggered from parent
  useEffect(() => {
    if (showScatterPlotTrigger && aoiData) {
      setShowScatterPlot(true)
    }
  }, [showScatterPlotTrigger, aoiData])

  // Handle view mode changes - removed for 2D-only mode
  // useEffect(() => {
  //   // 2D mode only - no view mode switching needed
  // }, [viewMode, updateGlobeLOD])


  // Transform point cloud coordinates - removed for 2D-only mode
  // useEffect(() => {
  //   // 2D mode only - no point cloud coordinate transformation needed
  // }, [viewMode, filterPointsByHeight])

  // Update ref with current 2D map state when it changes
  useEffect(() => {
    if (viewMode !== '2d' || !deckMapRef.current) return

    const updateMapState = () => {
      if (deckMapRef.current) {
        const mapState = deckMapRef.current.getMapState()
        if (mapState) {
          last2DMapStateRef.current = { center: mapState.center, zoom: mapState.zoom }
        }
      }
    }

    // Update immediately
    updateMapState()

    // Listen for map move events
    const map = deckMapRef.current.getMap()
    if (map) {
      map.on('moveend', updateMapState)
      map.on('zoomend', updateMapState)

      return () => {
        map.off('moveend', updateMapState)
        map.off('zoomend', updateMapState)
      }
    }
  }, [viewMode])

  // Calculate initial camera state - removed for 2D-only mode
  // const initialCameraState = useMemo(() => {
  //   // 2D mode only - no 3D camera state needed
  //   return undefined
  // }, [viewMode, mapCenter, mapZoom])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('[PointCloudViewer] Cleaning up on unmount')

      // Dispose LOD managers
      lodManagersRef.current.forEach(manager => {
        manager.dispose()
      })
      lodManagersRef.current = []

      // Cancel animation frames
      if (lodUpdateFrameRef.current !== null) {
        cancelAnimationFrame(lodUpdateFrameRef.current)
      }
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  return (
    <div className="point-cloud-viewer">
      {/* 2D mode only - GlobeViewer removed */}
      <DeckGLMapView
        key={mapViewKey}
        ref={deckMapRef}
        center={mapCenter}
        zoom={mapZoom}
        data={filteredDataForMap}
        colorMode={colorMode}
        colormap={colormap}
        pointSize={pointSize}
        dataVersion={dataVersion}
        isDrawingAOI={isDrawingAOI}
        aoiPolygon={aoiPolygon}
        onPolygonComplete={handlePolygonComplete}
        isGroundModeActive={isGroundModeActive}
        groundCameraPosition={groundCameraPosition}
        onGroundCameraPositionSet={handleGroundModeClick}
        groundModeViewData={groundModeViewData}
        intensityPercentiles={intensityPercentiles}
        onZoomThresholdChange={handleZoomThresholdChange}
      />

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">
            Loading COPC tiles... {Math.round(loadingProgress)}%
          </div>
        </div>
      )}

      {error && (
        <div className="error-overlay">
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {!loading && !error && (stats.files > 0 || lodManagersRef.current.length > 0) && (
        <div className="stats-overlay">
          {(() => {
            // For LOD manager mode, show loaded node points
            if (lodManagersRef.current.length > 0) {
              const lodStats = lodManagersRef.current.reduce((acc, manager) => {
                const stats = manager.getStats()
                return {
                  loadedNodes: acc.loadedNodes + stats.loadedNodes,
                  totalPoints: acc.totalPoints + stats.totalPoints
                }
              }, { loadedNodes: 0, totalPoints: 0 })

              return `${lodStats.totalPoints.toLocaleString()} points (${lodStats.loadedNodes} nodes) • ${lodManagersRef.current.length} file${lodManagersRef.current.length !== 1 ? 's' : ''} (LOD)`
            }

            // For simple loader mode, show total points
            return `${stats.points.toLocaleString()} points • ${stats.files} file${stats.files !== 1 ? 's' : ''}`
          })()}
        </div>
      )}

      {!loading && !error && stats.files === 0 && lodManagersRef.current.length === 0 && (
        <div className="stats-overlay">
          No data loaded. Configure filters and load COPC files to visualize.
        </div>
      )}

      {showScatterPlot && aoiData && (
        <AOIScatterPlot
          altitudes={aoiData.altitudes}
          intensities={aoiData.intensities}
          pointCount={aoiData.altitudes.length}
          onClose={() => setShowScatterPlot(false)}
        />
      )}
    </div>
  )
}
