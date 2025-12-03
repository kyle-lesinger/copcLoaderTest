import { BandType } from '../App'

/**
 * File mode - single or tiled COPC files
 */
export type FileMode = 'single' | 'tiled'

/**
 * File search result containing found files and metadata
 */
export interface FileSearchResult {
  files: string[]
  searchPattern: string
  bandType: BandType
  startDate: Date
  endDate: Date
  foundCount: number
  fileMode?: FileMode
}

/**
 * Configuration for file search
 */
export interface FileSearchConfig {
  baseDirectory?: string // Base directory or S3 bucket URL
  apiEndpoint?: string   // API endpoint for file listing
  fileList?: string[]    // Predefined list of files to search through
  fileMode?: FileMode    // File mode: 'single' or 'tiled' (default: 'tiled')
}

/**
 * Search for CALIPSO Potree directories matching date range and band type
 *
 * This function can work with three different file sources:
 * 1. API endpoint (queries backend for file list)
 * 2. Predefined file list (searches through provided array)
 * 3. Direct directory listing (if supported by environment)
 */
export async function searchCalipsoFiles(
  bandType: BandType,
  startDate: string,  // ISO datetime: YYYY-MM-DDTHH:mm:ss
  endDate: string,
  config: FileSearchConfig = {}
): Promise<FileSearchResult> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('[FileSearch] 🔍 SEARCHING FOR POTREE DIRECTORIES')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  const start = new Date(startDate)
  const end = new Date(endDate)

  console.log(`[FileSearch] 📅 Date range: ${start.toLocaleString()} to ${end.toLocaleString()}`)
  console.log(`[FileSearch] 🌓 Band type: ${bandType}`)

  // Generate search pattern
  const searchPattern = generateSearchPattern(bandType, start, end)
  console.log(`[FileSearch] 🔎 Search pattern: ${searchPattern}`)

  // Perform search based on available configuration
  let foundFiles: string[] = []

  const fileMode = config.fileMode || 'tiled' // Default to tiled mode

  if (config.apiEndpoint) {
    foundFiles = await searchViaAPI(config.apiEndpoint, bandType, start, end)
  } else if (config.fileList) {
    foundFiles = searchInFileList(config.fileList, bandType, start, end, fileMode)
  } else if (config.baseDirectory) {
    // For future implementation: search in directory or S3 bucket
    console.warn('[FileSearch] ⚠️  Directory search not yet implemented')
    foundFiles = []
  } else {
    console.warn('[FileSearch] ⚠️  No file source configured. Please provide apiEndpoint, fileList, or baseDirectory')
    foundFiles = []
  }

  // Log results
  console.log(`\n[FileSearch] ✅ SEARCH COMPLETE`)
  console.log(`[FileSearch] 📊 Found ${foundFiles.length} matching files`)

  if (foundFiles.length > 0) {
    console.log(`\n[FileSearch] 📁 Matching files:`)
    foundFiles.slice(0, 10).forEach((file, idx) => {
      const filename = file.split('/').pop() || file
      console.log(`  ${idx + 1}. ${filename}`)
    })
    if (foundFiles.length > 10) {
      console.log(`  ... and ${foundFiles.length - 10} more files`)
    }
    console.log(`\n[FileSearch] 💾 Files stored in memory for spatial filtering`)
    console.log(`[FileSearch] 🗺️  When spatial bounds filter is applied, these files will be loaded`)
  } else {
    console.log(`\n[FileSearch] ❌ No files found matching the criteria`)
    console.log(`[FileSearch] 💡 Tips:`)
    console.log(`  • Check date range matches available data`)
    console.log(`  • Verify band type selection (Day/Night)`)
    console.log(`  • Ensure file source is configured correctly`)
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  return {
    files: foundFiles,
    searchPattern,
    bandType,
    startDate: start,
    endDate: end,
    foundCount: foundFiles.length,
    fileMode
  }
}

/**
 * Generate search pattern based on band type and date range
 */
function generateSearchPattern(bandType: BandType, startDate: Date, endDate: Date): string {
  const basePattern = 'CAL_LID_L1-Standard-V4-51'

  // Format date range for pattern
  const startStr = formatDateForPattern(startDate)
  const endStr = formatDateForPattern(endDate)

  let bandPattern: string
  switch (bandType) {
    case 'day':
      bandPattern = 'ZD'
      break
    case 'night':
      bandPattern = 'ZN'
      break
    case 'all':
      bandPattern = 'Z[DN]'
      break
  }

  if (startStr === endStr) {
    return `${basePattern}.${startStr}*${bandPattern}` // Potree directory names
  } else {
    return `${basePattern}.{${startStr}..${endStr}}*${bandPattern}` // Potree directory names
  }
}

/**
 * Format date for filename pattern: YYYY-MM-DD
 */
function formatDateForPattern(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Search via API endpoint
 */
async function searchViaAPI(
  apiEndpoint: string,
  bandType: BandType,
  startDate: Date,
  endDate: Date
): Promise<string[]> {
  console.log(`[FileSearch] 🌐 Querying API: ${apiEndpoint}`)

  try {
    const params = new URLSearchParams({
      bandType,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    })

    const response = await fetch(`${apiEndpoint}?${params}`)

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    return data.files || []
  } catch (error) {
    console.error(`[FileSearch] ❌ API request failed:`, error)
    return []
  }
}

/**
 * Search in predefined file list
 */
function searchInFileList(
  fileList: string[],
  bandType: BandType,
  startDate: Date,
  endDate: Date,
  fileMode: FileMode = 'tiled'
): string[] {
  console.log(`[FileSearch] 📋 Searching through ${fileList.length} available COPC files`)
  console.log(`[FileSearch] 📁 File source: Configured file list (see getAvailableFileList() in fileSearch.ts)`)
  console.log(`[FileSearch] 🗂️  File mode: ${fileMode}`)
  console.log(`[FileSearch] 💡 To search different files, update getAvailableFileList() in src/utils/fileSearch.ts`)

  const results: string[] = []

  for (const filepath of fileList) {
    // Extract filename from path
    const filename = filepath.split('/').pop() || filepath

    // Check if filename matches CALIPSO pattern
    if (!filename.startsWith('CAL_LID_L1-Standard-V4-51')) {
      continue
    }

    // Extract date and band from COPC filename
    // Format: CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz (single)
    // Format: CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD_tile_south.copc.laz (tiled)
    const match = filename.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z([DN])/)
    if (!match) {
      continue
    }

    const [, dateStr, hours, minutes, seconds, band] = match

    // Check band type
    if (bandType === 'day' && band !== 'D') continue
    if (bandType === 'night' && band !== 'N') continue

    // Parse file date
    const fileDate = new Date(`${dateStr}T${hours}:${minutes}:${seconds}`)

    // Check if file date is within range
    if (fileDate >= startDate && fileDate <= endDate) {
      results.push(filepath)
    }
  }

  return results
}

/**
 * Parse CALIPSO filename to extract metadata
 */
export function parseCalipsoFilename(filename: string): {
  date: Date
  band: 'D' | 'N'
  version: string
} | null {
  const match = filename.match(/CAL_LID_L1-Standard-(V[\d-]+)\.(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z([DN])/)

  if (!match) {
    return null
  }

  const [, version, dateStr, hours, minutes, seconds, band] = match

  return {
    date: new Date(`${dateStr}T${hours}:${minutes}:${seconds}`),
    band: band as 'D' | 'N',
    version
  }
}

/**
 * Get available file list
 * IMPORTANT: Update this list to match your actual data directory
 *
 * In production, this should be replaced with:
 * - API endpoint that lists files from server
 * - S3 bucket listing
 * - Dynamic directory scan
 *
 * @param fileMode - 'single' for single COPC files (globe-spanning, may have corrupted octree),
 *                   'tiled' for latitude-tiled COPC files (4 tiles per timestamp, recommended)
 */
export function getAvailableFileList(fileMode: FileMode = 'tiled'): string[] {
  // Using COPC format (.copc.laz files) for efficient HTTP range-based loading
  // COPC supports loading only specific octree nodes, not the entire file

  if (fileMode === 'single') {
    // DEPRECATED: Single files have corrupted octree cube bounds for globe-spanning data
    const dataDirectory = '/data/final/tiled'
    return [
      // CALIPSO Level 1 data from 2023-06-30
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz`, // Day band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T17-37-28ZN.copc.laz`, // Night band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T18-23-08ZD.copc.laz`, // Day band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T19-15-53ZN.copc.laz`, // Night band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T20-01-33ZD.copc.laz`, // Day band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T20-54-18ZN.copc.laz`, // Night band
      `${dataDirectory}/CAL_LID_L1-Standard-V4-51.2023-06-30T21-39-53ZD.copc.laz`, // Day band
    ]
  } else {
    // RECOMMENDED: Tiled files with valid octree cube bounds (4 latitude tiles per timestamp)
    const dataDirectory = '/data/final/tiled'
    const tiles = ['south', 'south_mid', 'north_mid', 'north'] // 4 latitude tiles

    // For each timestamp, we have 4 tiles (south, south_mid, north_mid, north)
    const basenames = [
      'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD', // Day band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T17-37-28ZN', // Night band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T18-23-08ZD', // Day band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T19-15-53ZN', // Night band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T20-01-33ZD', // Day band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T20-54-18ZN', // Night band
      'CAL_LID_L1-Standard-V4-51.2023-06-30T21-39-53ZD', // Day band
    ]

    const tiledFiles: string[] = []
    for (const basename of basenames) {
      for (const tile of tiles) {
        tiledFiles.push(`${dataDirectory}/${basename}_tile_${tile}.copc.laz`)
      }
    }

    return tiledFiles
  }
}

/**
 * @deprecated Use getAvailableFileList() instead
 */
export function getExampleFileList(): string[] {
  console.warn('[FileSearch] ⚠️  getExampleFileList() is deprecated. Use getAvailableFileList() instead.')
  return getAvailableFileList()
}
