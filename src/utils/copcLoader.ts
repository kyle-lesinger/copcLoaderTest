import * as THREE from 'three'
import * as LazPerfModule from 'laz-perf'
import { applyColormap, Colormap } from './colormaps'
import { LatLon, isPointInPolygon, calculatePolygonArea } from './aoiSelector'

/**
 * Convert TAI time (seconds since 1993-01-01 00:00:00 UTC) to JavaScript Date
 * TAI = International Atomic Time, used by CALIPSO satellite
 */
export function taiToDate(taiSeconds: number): Date {
  // TAI epoch: January 1, 1993, 00:00:00 UTC
  const taiEpoch = new Date('1993-01-01T00:00:00.000Z').getTime() // milliseconds

  // Convert TAI seconds to milliseconds and add to epoch
  const utcMilliseconds = taiEpoch + (taiSeconds * 1000)

  return new Date(utcMilliseconds)
}

/**
 * Format TAI time as readable string
 */
export function formatTaiTime(taiSeconds: number): string {
  const date = taiToDate(taiSeconds)

  // Format as: YYYY-MM-DD HH:MM:SS.sss UTC
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hours = String(date.getUTCHours()).padStart(2, '0')
  const minutes = String(date.getUTCMinutes()).padStart(2, '0')
  const seconds = String(date.getUTCSeconds()).padStart(2, '0')
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds} UTC`
}

export interface PointCloudData {
  positions: Float32Array
  colors: Uint8Array
  intensities: Uint16Array
  classifications: Uint8Array
  gpsTimes?: Float64Array // GPS time for temporal filtering/sorting
  count: number // Alias for pointCount
  pointCount?: number // For compatibility with Potree loader
  bounds: {
    min: [number, number, number]
    max: [number, number, number]
  }
  firstPoint?: {
    lon: number
    lat: number
    alt: number
    gpsTime: number
  }
  lastPoint?: {
    lon: number
    lat: number
    alt: number
    gpsTime: number
  }
}

// LAZ header parsing helpers
function readLASHeader(buffer: ArrayBuffer) {
  const view = new DataView(buffer)

  // Read LAS header
  const signature = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  )

  if (signature !== 'LASF') {
    throw new Error('Invalid LAS file - signature mismatch')
  }

  const pointDataOffset = view.getUint32(96, true)
  const pointDataRecordFormat = view.getUint8(104)
  const pointDataRecordLength = view.getUint16(105, true)
  const pointCount = view.getUint32(107, true) ||  view.getUint32(247, true) // Legacy or extended

  const scaleX = view.getFloat64(131, true)
  const scaleY = view.getFloat64(139, true)
  const scaleZ = view.getFloat64(147, true)

  const offsetX = view.getFloat64(155, true)
  const offsetY = view.getFloat64(163, true)
  const offsetZ = view.getFloat64(171, true)

  const maxX = view.getFloat64(179, true)
  const minX = view.getFloat64(187, true)
  const maxY = view.getFloat64(195, true)
  const minY = view.getFloat64(203, true)
  const maxZ = view.getFloat64(211, true)
  const minZ = view.getFloat64(219, true)

  return {
    pointDataOffset,
    pointDataRecordFormat,
    pointDataRecordLength,
    pointCount,
    scale: { x: scaleX, y: scaleY, z: scaleZ },
    offset: { x: offsetX, y: offsetY, z: offsetZ },
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ }
  }
}

// Parse point format 6 (LAS 1.4)
function parsePointFormat6(
  pointBuffer: Uint8Array,
  scale: { x: number, y: number, z: number },
  offset: { x: number, y: number, z: number },
  index: number // Point index for debugging
) {
  const view = new DataView(pointBuffer.buffer, pointBuffer.byteOffset)

  // Point Format 6: X(4) Y(4) Z(4) Intensity(2) Flags(1) Classification(1)
  //                  ScanAngle(2) UserData(1) PointSourceID(2) GPSTime(8)
  //                  Red(2) Green(2) Blue(2) = 30 bytes minimum

  const x = view.getInt32(0, true) * scale.x + offset.x
  const y = view.getInt32(4, true) * scale.y + offset.y
  const z = view.getInt32(8, true) * scale.z + offset.z
  const intensity = view.getUint16(12, true)
  const classification = view.getUint8(15)

  // Try reading GPS time at offset 22 instead of 21
  // Point Source ID is at 19-20 (2 bytes), so next field starts at 21
  // But maybe there's alignment padding?
  let gpsTime = view.getFloat64(22, true)

  // Check if GPS time seems valid (should be positive and reasonable)
  // GPS time in LAS files is typically GPS week seconds (0-604800)
  if (gpsTime < 0 || gpsTime > 1e15 || !isFinite(gpsTime)) {
    // Try offset 21
    gpsTime = view.getFloat64(21, true)

    // If still invalid, try offset 20
    if (gpsTime < 0 || gpsTime > 1e15 || !isFinite(gpsTime)) {
      gpsTime = view.getFloat64(20, true)
    }

    // If all attempts fail, use point index as fallback
    if (gpsTime < 0 || gpsTime > 1e15 || !isFinite(gpsTime)) {
      gpsTime = index // Use point index as sequential time
    }
  }

  return { x, y, z, intensity, classification, gpsTime }
}

/**
 * Load a LAZ/COPC file and extract point cloud data using laz-perf
 * NOTE: This is the simple loader for 2D mode. For 3D with octree optimization, use COPCLODManager.
 */
export async function loadCOPCFile(url: string, onProgress?: (progress: number) => void): Promise<PointCloudData> {
  try {
    console.log(`[copcLoader.ts] Loading LAZ file for 2D mode: ${url}`)

    // Fetch the file
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    console.log(`Fetched ${arrayBuffer.byteLength} bytes`)

    if (onProgress) onProgress(10)

    // Parse LAS header
    const header = readLASHeader(arrayBuffer)
    console.log('LAS Header:', header)
    console.log(`Point format: ${header.pointDataRecordFormat}, Count: ${header.pointCount}`)

    if (onProgress) onProgress(20)

    // Initialize laz-perf WASM module
    console.log('Initializing laz-perf...')
    const createLazPerf = LazPerfModule.createLazPerf || LazPerfModule.create || LazPerfModule.default
    const lazPerf = await createLazPerf({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          return '/laz-perf.wasm'
        }
        return path
      }
    })
    console.log('laz-perf initialized')

    if (onProgress) onProgress(30)

    // Allocate memory in WASM heap for the file
    const fileSize = arrayBuffer.byteLength
    const filePtr = lazPerf._malloc(fileSize)
    if (!filePtr) {
      throw new Error('Failed to allocate memory for file')
    }

    // Copy file data to WASM heap
    lazPerf.HEAPU8.set(new Uint8Array(arrayBuffer), filePtr)
    console.log(`Copied file to WASM heap at ${filePtr}`)

    if (onProgress) onProgress(40)

    // Create LASZip decoder
    const laszip = new lazPerf.LASZip()
    laszip.open(filePtr, fileSize)

    const pointCount = laszip.getCount()
    const pointLength = laszip.getPointLength()
    const pointFormat = laszip.getPointFormat()

    console.log(`LASZip opened: ${pointCount} points, format ${pointFormat}, ${pointLength} bytes/point`)

    if (onProgress) onProgress(50)

    // Allocate buffer for a single point
    const pointPtr = lazPerf._malloc(pointLength)
    if (!pointPtr) {
      throw new Error('Failed to allocate memory for point buffer')
    }

    // Arrays to store point data
    const positions: number[] = []
    const intensities: number[] = []
    const classifications: number[] = []
    const gpsTimes: number[] = []

    const bounds = {
      min: [Infinity, Infinity, Infinity] as [number, number, number],
      max: [-Infinity, -Infinity, -Infinity] as [number, number, number]
    }

    // Variables to store first and last point info (will be set after sorting)
    let firstPoint: { lon: number, lat: number, alt: number, gpsTime: number } | undefined
    let lastPoint: { lon: number, lat: number, alt: number, gpsTime: number } | undefined

    // Determine decimation factor for large files
    // Target: reduce to ~5M points for sorting performance
    const TARGET_POINT_COUNT = 5_000_000
    let decimationFactor = 1
    if (pointCount > TARGET_POINT_COUNT) {
      decimationFactor = Math.ceil(pointCount / TARGET_POINT_COUNT)
      console.log(`Large file detected. Decimating by factor of ${decimationFactor} (keeping every ${decimationFactor}th point)`)
      console.log(`Target points: ~${Math.floor(pointCount / decimationFactor).toLocaleString()}`)
    }

    // Read all points (with optional decimation)
    console.log(`Reading ${pointCount} points...`)
    let actualPointsRead = 0
    for (let i = 0; i < pointCount; i++) {
      // Get point from LAZ
      laszip.getPoint(pointPtr)

      // Skip points based on decimation factor
      if (decimationFactor > 1 && i % decimationFactor !== 0) {
        continue
      }

      // Create a view of the point data
      const pointBuffer = new Uint8Array(
        lazPerf.HEAPU8.buffer,
        pointPtr,
        pointLength
      )

      // Parse point
      const point = parsePointFormat6(pointBuffer, header.scale, header.offset, i)

      positions.push(point.x, point.y, point.z)
      intensities.push(point.intensity)
      classifications.push(point.classification)
      gpsTimes.push(point.gpsTime)
      actualPointsRead++

      // Update bounds
      bounds.min[0] = Math.min(bounds.min[0], point.x)
      bounds.min[1] = Math.min(bounds.min[1], point.y)
      bounds.min[2] = Math.min(bounds.min[2], point.z)
      bounds.max[0] = Math.max(bounds.max[0], point.x)
      bounds.max[1] = Math.max(bounds.max[1], point.y)
      bounds.max[2] = Math.max(bounds.max[2], point.z)

      // Report progress every 10000 points
      if (i % 10000 === 0 && onProgress) {
        const progress = 50 + (i / pointCount) * 45
        onProgress(progress)
      }
    }

    console.log(`Read ${actualPointsRead.toLocaleString()} points (${decimationFactor > 1 ? `decimated from ${pointCount.toLocaleString()}` : 'no decimation'})`)

    // Find min/max GPS times without spread operator (avoids stack overflow)
    let minGpsTime = Infinity
    let maxGpsTime = -Infinity
    for (let i = 0; i < gpsTimes.length; i++) {
      minGpsTime = Math.min(minGpsTime, gpsTimes[i])
      maxGpsTime = Math.max(maxGpsTime, gpsTimes[i])
    }

    // Sort points by x,y (lat/lon) position groups, keeping all Z values together
    console.log('Grouping and sorting by x,y positions...')

    // Group points by x,y coordinates (each x,y represents a vertical laser shot)
    interface XYGroup {
      x: number
      y: number
      gpsTime: number
      indices: number[]
    }

    const xyMap = new Map<string, XYGroup>()

    for (let i = 0; i < actualPointsRead; i++) {
      const x = positions[i * 3]
      const y = positions[i * 3 + 1]
      const key = `${x.toFixed(6)},${y.toFixed(6)}`

      if (!xyMap.has(key)) {
        xyMap.set(key, {
          x,
          y,
          gpsTime: gpsTimes[i],
          indices: []
        })
      }
      xyMap.get(key)!.indices.push(i)
    }

    console.log(`Found ${xyMap.size} unique x,y positions`)

    // Sort x,y groups by GPS time
    const sortedGroups = Array.from(xyMap.values()).sort((a, b) => a.gpsTime - b.gpsTime)

    // Reorder all arrays based on sorted x,y groups
    const sortedPositions: number[] = []
    const sortedIntensities: number[] = []
    const sortedClassifications: number[] = []
    const sortedGpsTimes: number[] = []

    for (const group of sortedGroups) {
      // Add all points (all Z values) for this x,y position
      for (const idx of group.indices) {
        sortedPositions.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2])
        sortedIntensities.push(intensities[idx])
        sortedClassifications.push(classifications[idx])
        sortedGpsTimes.push(gpsTimes[idx])
      }
    }

    // Note: We'll use the sorted arrays directly instead of replacing the originals
    // to avoid stack overflow with large arrays

    // Set first and last points (now chronologically ordered)
    firstPoint = {
      lon: sortedPositions[0],
      lat: sortedPositions[1],
      alt: sortedPositions[2],
      gpsTime: sortedGpsTimes[0]
    }

    lastPoint = {
      lon: sortedPositions[(actualPointsRead - 1) * 3],
      lat: sortedPositions[(actualPointsRead - 1) * 3 + 1],
      alt: sortedPositions[(actualPointsRead - 1) * 3 + 2],
      gpsTime: sortedGpsTimes[actualPointsRead - 1]
    }

    if (onProgress) onProgress(95)

    // Cleanup
    lazPerf._free(pointPtr)
    lazPerf._free(filePtr)
    laszip.delete()

    console.log(`Loaded and sorted ${actualPointsRead.toLocaleString()} points`)
    console.log(`Bounds:`, bounds)

    if (onProgress) onProgress(100)

    // Convert sorted arrays to typed arrays
    const positionsArray = new Float32Array(sortedPositions)
    const intensitiesArray = new Uint16Array(sortedIntensities)
    const classificationsArray = new Uint8Array(sortedClassifications)
    const colors = new Uint8Array(actualPointsRead * 3)

    return {
      positions: positionsArray,
      colors,
      intensities: intensitiesArray,
      classifications: classificationsArray,
      gpsTimes: new Float64Array(sortedGpsTimes), // Add GPS times for compatibility
      count: actualPointsRead,
      pointCount: actualPointsRead, // Add for compatibility with Potree interface
      bounds,
      firstPoint,
      lastPoint
    }
  } catch (error) {
    console.error('Error loading LAZ file:', error)
    throw new Error(`Failed to load LAZ file: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Compute colors for points based on elevation
 */
export function computeElevationColors(
  positions: Float32Array,
  colors: Uint8Array,
  minZ: number,
  maxZ: number,
  colormap: Colormap = 'viridis'
) {
  const count = positions.length / 3
  const range = maxZ - minZ

  for (let i = 0; i < count; i++) {
    const z = positions[i * 3 + 2]
    const t = range > 0 ? (z - minZ) / range : 0.5

    const [r, g, b] = applyColormap(t, colormap)

    colors[i * 3] = r
    colors[i * 3 + 1] = g
    colors[i * 3 + 2] = b
  }
}

/**
 * Compute colors for points based on intensity
 *
 * @param useCalipsoScaling - If true, converts LAS intensity values back to physical units
 *                            using CALIPSO encoding: physical = (intensity / 10000) - 0.1
 *                            Then normalizes using physical min/max (default: 0 to 3.5 km⁻¹·sr⁻¹)
 */
export function computeIntensityColors(
  intensities: Uint16Array,
  colors: Uint8Array,
  minIntensity?: number,
  maxIntensity?: number,
  colormap: Colormap = 'viridis',
  useCalipsoScaling: boolean = true
) {
  const count = intensities.length

  // For CALIPSO data, use physical units (km⁻¹·sr⁻¹)
  // LAS encoding: intensity = (physical + 0.1) * 10000
  // Physical decoding: physical = (intensity / 10000) - 0.1
  if (useCalipsoScaling) {
    // Use scientific valid range for CALIPSO backscatter if not specified
    // 532nm valid range: -0.1 to 3.3, we use 0 to 3.5 for normalization
    const physicalMin = minIntensity !== undefined ? minIntensity : 0.0
    const physicalMax = maxIntensity !== undefined ? maxIntensity : 3.5
    const range = physicalMax - physicalMin

    for (let i = 0; i < count; i++) {
      const lasIntensity = intensities[i]

      // Convert LAS intensity back to physical units
      const physical = (lasIntensity / 10000.0) - 0.1

      // Normalize to 0-1 range using physical units
      const normalized = range > 0 ? Math.max(0, Math.min(1, (physical - physicalMin) / range)) : 0.5

      const [r, g, b] = applyColormap(normalized, colormap)

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
  } else {
    // Standard mode: use raw intensity values
    // Use provided min/max or compute from data
    if (minIntensity === undefined || maxIntensity === undefined) {
      minIntensity = Infinity
      maxIntensity = -Infinity
      for (let i = 0; i < count; i++) {
        minIntensity = Math.min(minIntensity, intensities[i])
        maxIntensity = Math.max(maxIntensity, intensities[i])
      }
    }

    const range = maxIntensity - minIntensity

    for (let i = 0; i < count; i++) {
      const intensity = intensities[i]
      const normalized = range > 0 ? (intensity - minIntensity) / range : 0.5

      const [r, g, b] = applyColormap(normalized, colormap)

      colors[i * 3] = r
      colors[i * 3 + 1] = g
      colors[i * 3 + 2] = b
    }
  }
}

/**
 * Compute colors for points based on classification
 */
export function computeClassificationColors(
  classifications: Uint8Array,
  colors: Uint8Array
) {
  // Standard LAS classification colors
  const classColors: Record<number, [number, number, number]> = {
    0: [128, 128, 128], // Unclassified - gray
    1: [200, 200, 200], // Unclassified - light gray
    2: [160, 82, 45],   // Ground - brown
    3: [34, 139, 34],   // Low Vegetation - green
    4: [50, 205, 50],   // Medium Vegetation - lime green
    5: [0, 128, 0],     // High Vegetation - dark green
    6: [255, 0, 0],     // Building - red
    7: [128, 128, 128], // Noise - gray
    9: [0, 191, 255],   // Water - deep sky blue
    17: [255, 192, 203] // Bridge - pink
  }

  const count = classifications.length
  for (let i = 0; i < count; i++) {
    const classification = classifications[i]
    const color = classColors[classification] || [128, 128, 128]

    colors[i * 3] = color[0]
    colors[i * 3 + 1] = color[1]
    colors[i * 3 + 2] = color[2]
  }
}

/**
 * Spatial bounds for efficient COPC loading
 */
export interface COPCSpatialBounds {
  minLon: number
  maxLon: number
  minLat: number
  maxLat: number
  minAlt: number
  maxAlt: number
}

/**
 * Intensity percentiles for progressive loading
 */
export interface IntensityPercentiles {
  p25: number  // 25th percentile
  p50: number  // 50th percentile (median)
  p75: number  // 75th percentile
  p90: number  // 90th percentile
}

/**
 * Load COPC file with efficient spatial filtering using octree hierarchy
 * Uses HTTP range requests to load only octree nodes that intersect the spatial bounds
 * Supports progressive loading based on intensity threshold for zoom-dependent detail
 */
export async function loadCOPCFileWithSpatialBounds(
  url: string,
  spatialBounds?: COPCSpatialBounds,
  onProgress?: (progress: number) => void,
  intensityThreshold?: number,  // Only load points with intensity >= this value (for progressive loading)
  aoiPolygon?: LatLon[] | null,  // Optional AOI polygon for precise filtering (in addition to bounding box)
  maxDepth?: number,  // Optional max octree depth override (from test config)
  maxNodes?: number   // Optional max nodes override (from test config)
): Promise<PointCloudData & { intensityPercentiles?: IntensityPercentiles }> {
  console.log(`[copcLoader] 🚀 Loading COPC file with spatial bounds: ${url}`)

  if (spatialBounds) {
    console.log(`[copcLoader] 📦 Spatial Bounds:`)
    console.log(`  Lon: ${spatialBounds.minLon.toFixed(2)}° to ${spatialBounds.maxLon.toFixed(2)}°`)
    console.log(`  Lat: ${spatialBounds.minLat.toFixed(2)}° to ${spatialBounds.maxLat.toFixed(2)}°`)
    console.log(`  Alt: ${spatialBounds.minAlt.toFixed(2)} to ${spatialBounds.maxAlt.toFixed(2)} km`)
  } else {
    console.log(`[copcLoader] ⚠️  No spatial bounds - will load entire file`)
  }

  // Check if AOI polygon filtering is enabled
  const useAOIPolygon = aoiPolygon && aoiPolygon.length >= 3
  if (useAOIPolygon) {
    console.log(`[copcLoader] 🎯 AOI Polygon filtering ENABLED (${aoiPolygon!.length} vertices)`)
    console.log(`[copcLoader] ℹ️  Points will be filtered by:`)
    console.log(`  1. Bounding box (fast octree culling)`)
    console.log(`  2. Polygon containment (precise per-point filtering)`)
  }

  // If no spatial bounds, use the simple loader
  if (!spatialBounds) {
    return loadCOPCFile(url, onProgress)
  }

  // Use COPC library for efficient octree-based loading
  const { Copc } = await import('copc')

  // Create HTTP range request getter
  const getter = async (begin: number, end: number): Promise<Uint8Array> => {
    const headers: HeadersInit = {}
    if (begin !== undefined && end !== undefined) {
      headers.Range = `bytes=${begin}-${end - 1}`
    }

    // HTTP range requests are logged only for initial file header (first 64KB)
    // This avoids console spam from hundreds of octree node requests
    if (begin === 0 && end <= 65536) {
      console.log(`[copcLoader] 📡 Loading COPC file header: bytes=${begin}-${end - 1} (${((end - begin) / 1024).toFixed(2)} KB)`)
    }

    const response = await fetch(url, { headers })
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return new Uint8Array(arrayBuffer)
  }

  // Load COPC metadata
  const copc = await Copc.create(getter)
  console.log(`[copcLoader] ✅ COPC file loaded:`, {
    pointCount: copc.header.pointCount,
    bounds: copc.info.cube,
    spacing: copc.info.spacing
  })

  // Debug: Log copc.header properties to understand what's available
  console.log(`[copcLoader] 🔍 DEBUG: copc.header properties:`, Object.keys(copc.header))
  console.log(`[copcLoader] 🔍 DEBUG: copc.header.min:`, copc.header.min)
  console.log(`[copcLoader] 🔍 DEBUG: copc.header.max:`, copc.header.max)
  console.log(`[copcLoader] 🔍 DEBUG: copc.header.scale:`, copc.header.scale)
  console.log(`[copcLoader] 🔍 DEBUG: copc.header.offset:`, copc.header.offset)
  console.log(`[copcLoader] 🔍 DEBUG: copc.info.cube (octree root bounds):`, copc.info.cube)
  console.log(`[copcLoader] 🔍 DEBUG: copc.info.spacing:`, copc.info.spacing)

  // CRITICAL FIX: Validate and reconstruct cube bounds if corrupted
  // The cube should contain [minX, minY, minZ, maxX, maxY, maxZ] in geographic coordinates
  // If coordinates are outside valid ranges, the COPC conversion was corrupted
  const cube = copc.info.cube
  const cubeMinLon = cube[0]
  const cubeMaxLon = cube[3]
  const cubeMinLat = cube[1]
  const cubeMaxLat = cube[4]

  const cubeValid = (
    cubeMinLon >= -180 && cubeMaxLon <= 180 &&
    cubeMinLat >= -90 && cubeMaxLat <= 90 &&
    cubeMinLon < cubeMaxLon &&
    cubeMinLat < cubeMaxLat
  )

  if (!cubeValid) {
    console.warn(`[copcLoader] 🚨 CORRUPTED OCTREE CUBE DETECTED!`)
    console.warn(`[copcLoader] 📊 Invalid cube bounds:`, {
      lon: `${cubeMinLon.toFixed(2)}° to ${cubeMaxLon.toFixed(2)}°`,
      lat: `${cubeMinLat.toFixed(2)}° to ${cubeMaxLat.toFixed(2)}°`
    })
    console.warn(`[copcLoader] 🔧 Reconstructing cube from header.min/max...`)

    // Reconstruct valid cube bounds from header
    // For CALIPSO track data spanning globe, use actual data bounds directly
    // The octree node calculation will still work with non-cubic bounds
    copc.info.cube = [
      copc.header.min[0],  // minX (lon)
      copc.header.min[1],  // minY (lat)
      copc.header.min[2],  // minZ (alt)
      copc.header.max[0],  // maxX (lon)
      copc.header.max[1],  // maxY (lat)
      copc.header.max[2]   // maxZ (alt)
    ]

    console.log(`[copcLoader] ✅ Reconstructed cube bounds:`, {
      lon: `${copc.info.cube[0].toFixed(2)}° to ${copc.info.cube[3].toFixed(2)}°`,
      lat: `${copc.info.cube[1].toFixed(2)}° to ${copc.info.cube[4].toFixed(2)}°`,
      alt: `${copc.info.cube[2].toFixed(3)} to ${copc.info.cube[5].toFixed(3)} km`
    })
    console.log(`[copcLoader] 💡 This fixes corrupted octree metadata from CRS reprojection`)
  } else {
    console.log(`[copcLoader] ✅ Cube bounds validation passed - octree metadata is valid`)
  }

  // ROOT NODE INTERSECTION CHECK
  // Check if the root node (entire file bounds) intersects with the requested spatial bounds
  // This allows us to skip loading tiles that don't overlap with the area of interest
  if (spatialBounds) {
    const rootMinLon = copc.info.cube[0]
    const rootMaxLon = copc.info.cube[3]
    const rootMinLat = copc.info.cube[1]
    const rootMaxLat = copc.info.cube[4]

    // Check for bounding box intersection
    const intersects = !(
      rootMaxLon < spatialBounds.minLon ||  // Root is entirely west of bounds
      rootMinLon > spatialBounds.maxLon ||  // Root is entirely east of bounds
      rootMaxLat < spatialBounds.minLat ||  // Root is entirely south of bounds
      rootMinLat > spatialBounds.maxLat     // Root is entirely north of bounds
    )

    if (!intersects) {
      console.log(`[copcLoader] ⏭️  SKIPPING FILE - Root node does not intersect with spatial bounds`)
      console.log(`[copcLoader] 📍 File bounds: Lon ${rootMinLon.toFixed(2)}° to ${rootMaxLon.toFixed(2)}°, Lat ${rootMinLat.toFixed(2)}° to ${rootMaxLat.toFixed(2)}°`)
      console.log(`[copcLoader] 🎯 Filter bounds: Lon ${spatialBounds.minLon.toFixed(2)}° to ${spatialBounds.maxLon.toFixed(2)}°, Lat ${spatialBounds.minLat.toFixed(2)}° to ${spatialBounds.maxLat.toFixed(2)}°`)

      // Return empty point cloud data
      return {
        points: [],
        colors: [],
        intensities: [],
        classifications: [],
        minIntensity: 0,
        maxIntensity: 0
      }
    }

    console.log(`[copcLoader] ✅ Root node intersection check passed - file overlaps with spatial bounds`)
    console.log(`[copcLoader] 📍 File bounds: Lon ${rootMinLon.toFixed(2)}° to ${rootMaxLon.toFixed(2)}°, Lat ${rootMinLat.toFixed(2)}° to ${rootMaxLat.toFixed(2)}°`)
  }

  // Log file bounding box in geographic coordinates
  // IMPORTANT: copc.header.min/max are ALREADY in geographic coordinates!
  // They are stored as Float64 values in the LAZ header (bytes 179-226)
  // DO NOT apply scale/offset to these values - they are not integer coordinates
  const fileMinLon = copc.header.min[0]
  const fileMaxLon = copc.header.max[0]
  const fileMinLat = copc.header.min[1]
  const fileMaxLat = copc.header.max[1]
  const fileMinAlt = copc.header.min[2]
  const fileMaxAlt = copc.header.max[2]

  console.log(`[copcLoader] 📊 File Geographic Bounds:`)
  console.log(`  Lon: ${fileMinLon.toFixed(2)}° to ${fileMaxLon.toFixed(2)}°`)
  console.log(`  Lat: ${fileMinLat.toFixed(2)}° to ${fileMaxLat.toFixed(2)}°`)
  console.log(`  Alt: ${fileMinAlt.toFixed(2)} to ${fileMaxAlt.toFixed(2)} km`)
  console.log(`[copcLoader] 🎯 Spatial Filter Bounds:`)
  console.log(`  Lon: ${spatialBounds.minLon}° to ${spatialBounds.maxLon}°`)
  console.log(`  Lat: ${spatialBounds.minLat}° to ${spatialBounds.maxLat}°`)
  console.log(`  Alt: ${spatialBounds.minAlt} to ${spatialBounds.maxAlt} km`)

  // Check if file bounds appear valid (not placeholder/incorrect values)
  const fileBoundsValid = (
    Math.abs(fileMaxLon - fileMinLon) > 0.01 &&
    Math.abs(fileMaxLat - fileMinLat) > 0.01 &&
    fileMinLon >= -180 && fileMaxLon <= 180 &&
    fileMinLat >= -90 && fileMaxLat <= 90
  )

  if (!fileBoundsValid) {
    console.warn(`[copcLoader] ⚠️  WARNING: File bounds appear invalid or placeholder (near-zero range)`)
    console.warn(`[copcLoader] 🔧 COPC metadata may be incorrect - DISABLING node-level spatial filtering`)
    console.warn(`[copcLoader] 💡 Will load ALL nodes and filter at point-level instead`)
  }

  // Check if file even intersects the spatial filter (only if bounds are valid)
  let fileIntersectsFilter = true // Default to true if bounds invalid
  if (fileBoundsValid) {
    fileIntersectsFilter = !(
      fileMaxLon < spatialBounds.minLon ||
      fileMinLon > spatialBounds.maxLon ||
      fileMaxLat < spatialBounds.minLat ||
      fileMinLat > spatialBounds.maxLat ||
      fileMaxAlt < spatialBounds.minAlt ||
      fileMinAlt > spatialBounds.maxAlt
    )

    if (!fileIntersectsFilter) {
      console.log(`[copcLoader] ⚠️  WARNING: Entire file is outside spatial bounds!`)
      console.log(`[copcLoader] 💡 This CALIPSO orbit pass does not cover the requested geographic region`)
      console.log(`[copcLoader] 💡 Try different date/time or disable spatial filter to see where data is located`)
    } else {
      console.log(`[copcLoader] ✅ File intersects spatial filter - proceeding with octree traversal`)
    }
  }

  if (onProgress) onProgress(20)

  // Helper function to check if node bounds intersect spatial filter
  const nodeIntersectsBounds = (node: any): boolean => {
    // If file bounds are invalid, skip node-level filtering entirely
    // We'll filter at the point level instead where we have actual coordinates
    if (!fileBoundsValid) {
      return true  // Accept all nodes, filter points instead
    }

    // Get node bounds in scaled coordinates
    const cube = copc.info.cube
    const spacing = copc.info.spacing

    // Calculate node size based on depth
    // OCTREE DEPTH: Depth 0 is root (biggest), higher depth = smaller nodes
    // Node size DECREASES with depth: size = spacing / (2^depth)
    const [depthStr] = node.key.split('-')
    const depth = parseInt(depthStr)
    const nodeSize = spacing / Math.pow(2, depth)

    // Calculate node bounds in octree coordinate space
    // IMPORTANT: copc.info.cube is ALREADY in geographic coordinates!
    // Unlike point coordinates which need scaling, the octree cube bounds
    // from the COPC VLR are pre-computed geographic coordinates
    const nodeMin = [
      cube[0] + node.x * nodeSize,
      cube[1] + node.y * nodeSize,
      cube[2] + node.z * nodeSize
    ]
    const nodeMax = [
      nodeMin[0] + nodeSize,
      nodeMin[1] + nodeSize,
      nodeMin[2] + nodeSize
    ]

    // Node bounds are ALREADY in geographic coordinates - don't apply scale/offset!
    const minLon = nodeMin[0]
    const maxLon = nodeMax[0]
    const minLat = nodeMin[1]
    const maxLat = nodeMax[1]
    const minAlt = nodeMin[2]
    const maxAlt = nodeMax[2]

    // Check intersection with spatial bounds
    const intersects = !(
      maxLon < spatialBounds.minLon ||
      minLon > spatialBounds.maxLon ||
      maxLat < spatialBounds.minLat ||
      minLat > spatialBounds.maxLat ||
      maxAlt < spatialBounds.minAlt ||
      minAlt > spatialBounds.maxAlt
    )

    // Debug: Log first 3 node bounds for debugging
    if (node.key === '0-0-0-0' || node.key === '1-0-0-0' || node.key === '1-1-0-0') {
      console.log(`[copcLoader] 🔍 DEBUG Node ${node.key}:`)
      console.log(`  cube:`, cube)
      console.log(`  nodeSize:`, nodeSize)
      console.log(`  nodeMin (before scale):`, nodeMin)
      console.log(`  nodeMax (before scale):`, nodeMax)
      console.log(`  Geographic bounds: Lon ${minLon.toFixed(2)}° to ${maxLon.toFixed(2)}°, Lat ${minLat.toFixed(2)}° to ${maxLat.toFixed(2)}°`)
      console.log(`  Intersects filter:`, intersects)
    }

    return intersects
  }

  // LOD Configuration: Adaptive node limit based on spatial bounds size
  // Calculate the spatial extent to determine if we're looking at a large or small area
  const lonRange = spatialBounds.maxLon - spatialBounds.minLon
  const latRange = spatialBounds.maxLat - spatialBounds.minLat
  const altRange = spatialBounds.maxAlt - spatialBounds.minAlt

  // Calculate approximate volume of the spatial bounds (in normalized units)
  // For CALIPSO data spanning -180 to 180 lon, -82 to 82 lat, 0 to 40 alt:
  // - Full dataset: 360° × 164° × 40km = ~2,361,600 cubic units
  // - Small region: 10° × 10° × 5km = 500 cubic units

  // When using AOI polygon, estimate the actual area coverage
  // AOI polygons are typically much smaller than their bounding box
  let boundsVolume = lonRange * latRange * altRange

  if (useAOIPolygon) {
    // When using polygon filtering, force high-detail settings
    // The polygon will handle the actual filtering, so we want all nodes within the bbox
    boundsVolume = 100  // Force small volume detection for maximum detail
    console.log(`[copcLoader] 🎯 AOI polygon detected - forcing high-detail LOD`)
    console.log(`[copcLoader] 📐 Bounding box: ${(lonRange * latRange * altRange).toFixed(0)} cubic units`)
    console.log(`[copcLoader] 🔍 Polygon will filter points precisely - loading all nodes in bbox`)
  }

  // Define thresholds for adaptive node limits
  // Large bounds (> 50,000 cubic units): 500 nodes - Fast loading for overview
  // Medium bounds (5,000 - 50,000): 1000 nodes - Balanced detail
  // Small bounds (< 5,000): 1500 nodes - High detail for focused areas
  const VOLUME_THRESHOLD_LARGE = 50000
  const VOLUME_THRESHOLD_SMALL = 5000

  let MAX_NODES: number
  let MAX_DEPTH: number

  // Check if test configuration overrides are provided
  if (maxDepth !== undefined && maxNodes !== undefined) {
    MAX_NODES = maxNodes
    MAX_DEPTH = maxDepth
    console.log(`[copcLoader] 🧪 Using TEST CONFIGURATION overrides:`)
    console.log(`[copcLoader]   • MAX_NODES: ${MAX_NODES}`)
    console.log(`[copcLoader]   • MAX_DEPTH: ${MAX_DEPTH}`)
  } else if (boundsVolume > VOLUME_THRESHOLD_LARGE) {
    // Large area - prioritize speed
    MAX_NODES = 500
    MAX_DEPTH = 8
    console.log(`[copcLoader] 📊 Large spatial bounds detected (${boundsVolume.toFixed(0)} cubic units)`)
    console.log(`[copcLoader] ⚡ Using fast loading: ${MAX_NODES} nodes, depth ${MAX_DEPTH}`)
  } else if (boundsVolume > VOLUME_THRESHOLD_SMALL) {
    // Medium area - balanced
    MAX_NODES = 1000
    MAX_DEPTH = 10
    console.log(`[copcLoader] 📊 Medium spatial bounds detected (${boundsVolume.toFixed(0)} cubic units)`)
    console.log(`[copcLoader] ⚖️  Using balanced loading: ${MAX_NODES} nodes, depth ${MAX_DEPTH}`)
  } else {
    // Small area - prioritize detail
    MAX_NODES = 1500
    MAX_DEPTH = 12
    console.log(`[copcLoader] 📊 Small spatial bounds detected (${boundsVolume.toFixed(0)} cubic units)`)
    console.log(`[copcLoader] 🔍 Using high-detail loading: ${MAX_NODES} nodes, depth ${MAX_DEPTH}`)
  }

  // Collect nodes to load
  const nodesToLoad: Array<[string, any]> = []
  let totalNodesChecked = 0
  let nodesSkipped = 0
  let depthLimitedNodes = 0

  // When file bounds are invalid, use a VERY simple strategy: just load root + depth 1
  // This avoids slow traversal and gives us a quick preview
  if (!fileBoundsValid) {
    console.log(`[copcLoader] 🎯 Invalid bounds detected - using ULTRA simplified loading`)
    console.log(`[copcLoader] 📊 Loading root + depth 1 nodes ONLY (fast preview)`)
    console.log(`[copcLoader] 💡 For full data, COPC file metadata needs to be fixed`)

    // Load root hierarchy page (depth 0)
    const { nodes: rootNodes, pages: rootPages } = await Copc.loadHierarchyPage(getter, copc.info.rootHierarchyPage)

    console.log(`[copcLoader] 📦 Loaded root page: ${Object.keys(rootNodes).length} nodes at depth 0`)

    // Add root nodes
    for (const [key, node] of Object.entries(rootNodes)) {
      totalNodesChecked++
      ;(node as any).key = key
      const [depthStr, xStr, yStr, zStr] = key.split('-').map(Number)
      ;(node as any).x = xStr
      ;(node as any).y = yStr
      ;(node as any).z = zStr
      nodesToLoad.push([key, node])
    }

    console.log(`[copcLoader] ✅ Collected ${nodesToLoad.length} nodes (root only - FAST!)`)
  } else {
    // Normal traversal with spatial bounds filtering
    console.log(`[copcLoader] 🌳 Starting breadth-first octree traversal with spatial filtering`)
    console.log(`[copcLoader] 🎯 LOD settings: MAX_DEPTH=${MAX_DEPTH}, MAX_NODES=${MAX_NODES}`)

    const queue: any[] = [copc.info.rootHierarchyPage]
    let pagesProcessed = 0

    while (queue.length > 0 && nodesToLoad.length < MAX_NODES) {
      const hierarchyPage = queue.shift()!
      const { nodes, pages } = await Copc.loadHierarchyPage(getter, hierarchyPage)
      pagesProcessed++

      // Process all nodes in this hierarchy page
      for (const [key, node] of Object.entries(nodes)) {
        totalNodesChecked++

        // Check if we've hit max nodes limit
        if (nodesToLoad.length >= MAX_NODES) {
          console.log(`[copcLoader] ⚠️  Reached max nodes limit (${MAX_NODES}) - stopping traversal`)
          break
        }

        // Add key to node for bounds checking
        ;(node as any).key = key
        const [depthStr, xStr, yStr, zStr] = key.split('-').map(Number)
        ;(node as any).x = xStr
        ;(node as any).y = yStr
        ;(node as any).z = zStr

        const depth = depthStr

        // Check depth limit (LOD optimization)
        if (depth > MAX_DEPTH) {
          depthLimitedNodes++
          continue
        }

        // Check if this node intersects spatial bounds
        if (nodeIntersectsBounds(node)) {
          // Node intersects - add it to load list
          nodesToLoad.push([key, node])

          // Only queue child pages if we haven't hit depth limit
          if (depth < MAX_DEPTH) {
            for (const childPage of Object.values(pages)) {
              queue.push(childPage)
            }
          }
        } else {
          // Node doesn't intersect - skip entire subtree
          nodesSkipped++
        }
      }

      // Early exit if we've reached max nodes
      if (nodesToLoad.length >= MAX_NODES) {
        break
      }
    }

    console.log(`[copcLoader] 📄 Processed ${pagesProcessed} hierarchy pages`)
  }

  console.log(`[copcLoader] ✅ Found ${nodesToLoad.length} nodes intersecting spatial bounds (depth ≤ ${MAX_DEPTH})`)
  console.log(`[copcLoader] 📉 Skipped ${nodesSkipped} nodes outside bounds, ${depthLimitedNodes} beyond depth limit`)
  console.log(`[copcLoader] ⚡ Total reduction: ${(100 * (nodesSkipped + depthLimitedNodes) / totalNodesChecked).toFixed(1)}%`)

  if (onProgress) onProgress(60)

  // Load point data from filtered nodes
  const positions: number[] = []
  const intensities: number[] = []
  const classifications: number[] = []
  const gpsTimes: number[] = []

  const bounds = {
    min: [Infinity, Infinity, Infinity] as [number, number, number],
    max: [-Infinity, -Infinity, -Infinity] as [number, number, number]
  }

  let totalPointsLoaded = 0

  console.log(`[copcLoader] 📦 Loading point data from ${nodesToLoad.length} nodes...`)

  // Load nodes in parallel batches for better performance
  const BATCH_SIZE = 50 // Load 50 nodes at a time in parallel
  const batches = []
  for (let i = 0; i < nodesToLoad.length; i += BATCH_SIZE) {
    batches.push(nodesToLoad.slice(i, i + BATCH_SIZE))
  }

  console.log(`[copcLoader] ⚡ Loading ${batches.length} batches of ${BATCH_SIZE} nodes in parallel`)

  let processedNodes = 0

  // Process batches sequentially, but nodes within each batch in parallel
  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]

    // Load all nodes in this batch in parallel
    const batchResults = await Promise.all(
      batch.map(async ([key, node]) => {
        try {
          const view = await Copc.loadPointDataView(getter, copc, node)
          return { key, node, view, success: true }
        } catch (error) {
          console.error(`[copcLoader] ❌ Failed to load node ${key}:`, error)
          return { key, node, view: null, success: false }
        }
      })
    )

    // Process points from all successfully loaded nodes in this batch
    for (const result of batchResults) {
      if (!result.success || !result.view) continue

      const { key, node, view } = result
      processedNodes++

      // Get point count for this node
      const nodePointCount = (node as any).pointCount || 0

      // Create getters for dimensions
      const getX = view.getter('X')
      const getY = view.getter('Y')
      const getZ = view.getter('Z')
      const getIntensity = view.getter('Intensity')
      const getClassification = view.getter('Classification')
      const getGpsTime = view.getter('GpsTime')

      // Track invalid points for diagnostics
      let invalidCount = 0
      let outOfBoundsCount = 0
      let filteredCount = 0
      let polygonFilteredCount = 0 // Track points filtered by AOI polygon specifically

      // Parse each point in this node
      for (let j = 0; j < nodePointCount; j++) {
        // Get geographic coordinates (already scaled by view.getter())
        const lon = getX(j)
        const lat = getY(j)
        const alt = getZ(j)

        // Validate coordinates - filter out NaN, Infinity, or invalid values
        if (!isFinite(lon) || !isFinite(lat) || !isFinite(alt)) {
          invalidCount++
          // Log first few invalid points for debugging
          if (invalidCount <= 3) {
            console.warn(`[copcLoader] ⚠️  Invalid coordinate in node ${key}, point ${j}: lon=${lon}, lat=${lat}, alt=${alt}`)
          }
          continue // Skip invalid coordinates
        }

        // Validate geographic bounds - reject physically impossible values
        if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
          outOfBoundsCount++
          // Log first few out-of-bounds points for debugging
          if (outOfBoundsCount <= 3) {
            console.warn(`[copcLoader] 🌍 Coordinate outside valid geographic range in node ${key}, point ${j}: lon=${lon}, lat=${lat}, alt=${alt}`)
          }
          continue // Skip coordinates outside valid geographic range
        }

        // Apply per-point spatial filter (bounding box)
        if (lon < spatialBounds.minLon || lon > spatialBounds.maxLon ||
            lat < spatialBounds.minLat || lat > spatialBounds.maxLat ||
            alt < spatialBounds.minAlt || alt > spatialBounds.maxAlt) {
          filteredCount++
          continue // Skip points outside bounds
        }

        // Apply AOI polygon filter if enabled (precise filtering)
        if (useAOIPolygon && !isPointInPolygon({ lat, lon }, aoiPolygon!)) {
          filteredCount++
          polygonFilteredCount++
          continue // Skip points outside AOI polygon
        }

        // Get intensity for this point
        const intensity = getIntensity(j)

        // Apply intensity threshold filter (for progressive loading)
        if (intensityThreshold !== undefined && intensity < intensityThreshold) {
          filteredCount++
          continue // Skip points below intensity threshold
        }

        // Add point to arrays
        positions.push(lon, lat, alt)
        intensities.push(intensity)
        classifications.push(getClassification(j))
        gpsTimes.push(getGpsTime(j))

        // Update bounds
        bounds.min[0] = Math.min(bounds.min[0], lon)
        bounds.min[1] = Math.min(bounds.min[1], lat)
        bounds.min[2] = Math.min(bounds.min[2], alt)
        bounds.max[0] = Math.max(bounds.max[0], lon)
        bounds.max[1] = Math.max(bounds.max[1], lat)
        bounds.max[2] = Math.max(bounds.max[2], alt)

        totalPointsLoaded++
      }

      // DISABLED: Log filtering statistics for this node (too verbose)
      // Keep track of stats but don't log every node
      /*
      if (invalidCount > 0 || outOfBoundsCount > 0 || filteredCount > 0) {
        console.warn(`[copcLoader] 📊 Node ${key} filtering summary:`)
        if (invalidCount > 0) {
          console.warn(`  • Invalid coordinates (NaN/Infinity): ${invalidCount}`)
        }
        if (outOfBoundsCount > 0) {
          console.warn(`  • Out of geographic bounds: ${outOfBoundsCount}`)
        }
        if (filteredCount > 0) {
          console.warn(`  • Filtered by spatial bounds: ${filteredCount}`)
          if (polygonFilteredCount > 0) {
            console.warn(`    - Polygon filter: ${polygonFilteredCount} points`)
          }
        }
        console.warn(`  • Valid points kept: ${totalPointsLoaded}`)
      }
      */
    }

    // Log progress after each batch
    console.log(`[copcLoader] 📦 Batch ${batchIdx + 1}/${batches.length} complete: ${processedNodes}/${nodesToLoad.length} nodes processed (${(processedNodes / nodesToLoad.length * 100).toFixed(1)}%)`)

    if (onProgress) {
      onProgress(60 + (processedNodes / nodesToLoad.length) * 35)
    }
  }

  console.log(`[copcLoader] ✅ Loaded ${totalPointsLoaded.toLocaleString()} points from ${nodesToLoad.length} nodes`)
  console.log(`[copcLoader] 📊 Spatial filtering reduced data by ${(100 * (1 - totalPointsLoaded / copc.header.pointCount)).toFixed(1)}%`)

  // Log actual data bounds that were loaded
  if (totalPointsLoaded > 0) {
    console.log(`[copcLoader] 📍 Actual data bounds loaded:`)
    console.log(`  Lon: ${bounds.min[0].toFixed(4)}° to ${bounds.max[0].toFixed(4)}° (range: ${(bounds.max[0] - bounds.min[0]).toFixed(4)}°)`)
    console.log(`  Lat: ${bounds.min[1].toFixed(4)}° to ${bounds.max[1].toFixed(4)}° (range: ${(bounds.max[1] - bounds.min[1]).toFixed(4)}°)`)
    console.log(`  Alt: ${bounds.min[2].toFixed(2)} to ${bounds.max[2].toFixed(2)} km (range: ${(bounds.max[2] - bounds.min[2]).toFixed(2)} km)`)
    console.log(`[copcLoader] 🎯 Requested spatial filter:`)
    console.log(`  Lon: ${spatialBounds.minLon.toFixed(2)}° to ${spatialBounds.maxLon.toFixed(2)}°`)
    console.log(`  Lat: ${spatialBounds.minLat.toFixed(2)}° to ${spatialBounds.maxLat.toFixed(2)}°`)
    console.log(`  Alt: ${spatialBounds.minAlt.toFixed(2)} to ${spatialBounds.maxAlt.toFixed(2)} km`)

    // Log sample coordinates to verify data quality
    console.log(`[copcLoader] 🔍 Sample coordinates from loaded data (first 20 points):`)
    const sampleSize = Math.min(20, totalPointsLoaded)
    for (let i = 0; i < sampleSize; i++) {
      const lon = positions[i * 3]
      const lat = positions[i * 3 + 1]
      const alt = positions[i * 3 + 2]
      console.log(`  Point ${i}: lon=${lon.toFixed(4)}°, lat=${lat.toFixed(4)}°, alt=${alt.toFixed(2)} km`)
    }
  }

  if (totalPointsLoaded === 0) {
    console.warn(`[copcLoader] ⚠️  No points found within spatial bounds`)
    console.warn(`[copcLoader] 💡 Try adjusting your spatial filter to match the data location`)
  }

  // Convert arrays to typed arrays
  const positionsArray = new Float32Array(positions)
  const intensitiesArray = new Uint16Array(intensities)
  const classificationsArray = new Uint8Array(classifications)
  const gpsTimesArray = new Float64Array(gpsTimes)
  const colors = new Uint8Array(totalPointsLoaded * 3)

  // Find first and last points based on GPS time
  let firstPoint: { lon: number, lat: number, alt: number, gpsTime: number } | undefined
  let lastPoint: { lon: number, lat: number, alt: number, gpsTime: number } | undefined

  if (totalPointsLoaded > 0) {
    let minGpsTime = Infinity
    let maxGpsTime = -Infinity
    let minIdx = 0
    let maxIdx = 0

    for (let i = 0; i < totalPointsLoaded; i++) {
      if (gpsTimesArray[i] < minGpsTime) {
        minGpsTime = gpsTimesArray[i]
        minIdx = i
      }
      if (gpsTimesArray[i] > maxGpsTime) {
        maxGpsTime = gpsTimesArray[i]
        maxIdx = i
      }
    }

    firstPoint = {
      lon: positionsArray[minIdx * 3],
      lat: positionsArray[minIdx * 3 + 1],
      alt: positionsArray[minIdx * 3 + 2],
      gpsTime: minGpsTime
    }

    lastPoint = {
      lon: positionsArray[maxIdx * 3],
      lat: positionsArray[maxIdx * 3 + 1],
      alt: positionsArray[maxIdx * 3 + 2],
      gpsTime: maxGpsTime
    }
  }

  // DISABLED: Calculate intensity percentiles for progressive loading
  // Percentile calculation was causing performance issues (sorting large arrays)
  // Only calculate if no threshold was applied (i.e., this is the initial load)
  let intensityPercentiles: IntensityPercentiles | undefined
  // Disabled for performance - sorting millions of points is too slow
  /*
  if (intensityThreshold === undefined && totalPointsLoaded > 0) {
    // Sort intensity values to find percentiles
    const sortedIntensities = Array.from(intensitiesArray).sort((a, b) => a - b)

    // Convert LAS intensity values to physical units for percentile thresholds
    // CALIPSO encoding: intensity = (physical + 0.1) * 10000
    // Physical units: km⁻¹·sr⁻¹
    const lasToPhysical = (lasValue: number) => (lasValue / 10000.0) - 0.1

    intensityPercentiles = {
      p25: lasToPhysical(sortedIntensities[Math.floor(sortedIntensities.length * 0.25)]),
      p50: lasToPhysical(sortedIntensities[Math.floor(sortedIntensities.length * 0.50)]),
      p75: lasToPhysical(sortedIntensities[Math.floor(sortedIntensities.length * 0.75)]),
      p90: lasToPhysical(sortedIntensities[Math.floor(sortedIntensities.length * 0.90)])
    }

    console.log(`[copcLoader] 📊 Intensity percentiles calculated (physical units):`)
    console.log(`  • 25th percentile (p25): ${intensityPercentiles.p25.toFixed(4)} km⁻¹·sr⁻¹`)
    console.log(`  • 50th percentile (p50): ${intensityPercentiles.p50.toFixed(4)} km⁻¹·sr⁻¹`)
    console.log(`  • 75th percentile (p75): ${intensityPercentiles.p75.toFixed(4)} km⁻¹·sr⁻¹`)
    console.log(`  • 90th percentile (p90): ${intensityPercentiles.p90.toFixed(4)} km⁻¹·sr⁻¹`)
    console.log(`  💡 These thresholds enable progressive loading based on zoom level`)
  }
  */
  console.log(`[copcLoader] ⚡ Percentile calculation DISABLED for performance`)

  if (onProgress) onProgress(100)

  return {
    positions: positionsArray,
    colors,
    intensities: intensitiesArray,
    classifications: classificationsArray,
    gpsTimes: gpsTimesArray,
    count: totalPointsLoaded,
    pointCount: totalPointsLoaded,
    bounds,
    firstPoint,
    lastPoint,
    intensityPercentiles
  }
}
