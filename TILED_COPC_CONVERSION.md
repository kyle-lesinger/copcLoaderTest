# Tiled COPC Conversion Guide

This guide explains how to convert CALIPSO LAS files to latitude-tiled COPC format to avoid octree cube corruption issues with globe-spanning data.

## Problem

PDAL's COPC writer calculates corrupted cube bounds for globe-spanning satellite data (e.g., latitude values of 304° instead of valid -90° to 90° range). This causes:
- Incorrect spatial indexing
- Octree traversal failures
- Loading hangs or crashes

## Solution: Latitude Tiling

Split each LAS file into 4 latitude tiles before COPC conversion:

| Tile Name   | Latitude Range | Description                    |
|-------------|----------------|--------------------------------|
| south       | -90° to -30°   | Southern polar to mid-southern |
| south_mid   | -30° to 0°     | Mid-southern to equator        |
| north_mid   | 0° to 30°      | Equator to mid-northern        |
| north       | 30° to 90°     | Mid-northern to northern polar |

Each tile has valid COPC cube bounds, enabling:
- ✅ Correct octree spatial indexing
- ✅ Root node intersection checking (skip non-overlapping tiles)
- ✅ Efficient HTTP range-based loading
- ✅ Fast visualization (94.5% data reduction via spatial filtering)

## Prerequisites

### 1. Install PDAL with COPC support

```bash
# Create conda environment
conda create -n pdal -c conda-forge pdal python-pdal

# Activate environment
conda activate pdal

# Verify PDAL installation
pdal --version
```

### 2. Prepare Input Data

Ensure you have CALIPSO LAS files in EPSG:4326 (WGS84):
- X dimension = Longitude (-180° to 180°)
- Y dimension = Latitude (-90° to 90°)
- Z dimension = Altitude (km MSL)

## Scripts

### 1. Python Script: `convert_las_to_tiled_copc.py`

Converts a single LAS file or batch processes all LAS files in a directory.

#### Single File Conversion

```bash
python convert_las_to_tiled_copc.py input.las [output_dir]
```

Example:
```bash
python convert_las_to_tiled_copc.py \
  CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.las \
  ./public/data/tiled
```

Output (4 files in `public/data/tiled/`):
```
CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD_tile_south.copc.laz
CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD_tile_south_mid.copc.laz
CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD_tile_north_mid.copc.laz
CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD_tile_north.copc.laz
```

#### Batch Conversion

```bash
python convert_las_to_tiled_copc.py --all <las_dir> <output_dir>
```

Example:
```bash
python convert_las_to_tiled_copc.py --all ./las_files ./public/data/tiled
```

### 2. Bash Script: `batch_convert_to_tiled_copc.sh`

Wrapper script with progress tracking and error handling.

```bash
./batch_convert_to_tiled_copc.sh [input_dir] [output_dir]
```

Example:
```bash
./batch_convert_to_tiled_copc.sh ./las_files ./public/data/tiled
```

Features:
- Color-coded output
- Progress tracking (file N/M)
- Error handling
- Success/failure summary
- Automatic conda environment activation

## PDAL Pipeline Details

Each tile is created using this PDAL pipeline:

```json
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "input.las"
    },
    {
      "type": "filters.range",
      "limits": "Y[-30:0]"  // Example: south_mid tile
    },
    {
      "type": "filters.stats",
      "dimensions": "X,Y,Z,Intensity"
    },
    {
      "type": "writers.copc",
      "filename": "output_tile_south_mid.copc.laz",
      "forward": "all",
      "a_srs": "EPSG:4326",
      "scale_x": 0.0001,
      "scale_y": 0.0001,
      "scale_z": 0.001,
      "offset_x": "auto",
      "offset_y": "auto",
      "offset_z": "auto"
    }
  ]
}
```

Key parameters:
- `filters.range`: Filters by Y dimension (latitude)
- `scale_x/y`: 0.0001° precision (~11m at equator)
- `scale_z`: 0.001 km precision (1m)
- `offset_*`: Auto-calculated for optimal precision

## Verification

### Check COPC Cube Bounds

```bash
pdal info output_tile_south_mid.copc.laz | grep -A 10 "cube"
```

Expected output:
```json
"cube": {
  "minx": -180.0,
  "miny": -30.0,
  "minz": -0.5,
  "maxx": 180.0,
  "maxy": 0.0,
  "maxz": 30.0
}
```

✅ Valid bounds (latitude -30° to 0°)
❌ Invalid bounds (latitude > 90° or < -90°)

### Compare File Sizes

```bash
ls -lh *.copc.laz
```

Example output:
```
-rw-r--r--  1 user  staff   245M  original.copc.laz
-rw-r--r--  1 user  staff    82M  tile_south.copc.laz
-rw-r--r--  1 user  staff    78M  tile_south_mid.copc.laz
-rw-r--r--  1 user  staff    51M  tile_north_mid.copc.laz
-rw-r--r--  1 user  staff    34M  tile_north.copc.laz
```

Total tiled size may be slightly larger due to octree overhead in 4 files.

## Web Visualization Usage

### Update File List

Edit `src/utils/fileSearch.ts`:

```typescript
export function getAvailableFileList(fileMode: FileMode = 'tiled'): string[] {
  const dataDirectory = '/potree_data/tiled'
  const tiles = ['south', 'south_mid', 'north_mid', 'north']

  const basenames = [
    'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD',
    'CAL_LID_L1-Standard-V4-51.2023-06-30T17-37-28ZN',
    // Add more timestamps...
  ]

  const tiledFiles: string[] = []
  for (const basename of basenames) {
    for (const tile of tiles) {
      tiledFiles.push(`${dataDirectory}/${basename}_tile_${tile}.copc.laz`)
    }
  }

  return tiledFiles
}
```

### Root Node Intersection

The viewer automatically checks if each tile's root node intersects with the spatial bounds filter before loading. This skips 75% of tiles (3 of 4) that don't overlap with the AOI.

Example console output:
```
[COPCLoader] ⊗ Root node does not intersect spatial bounds, skipping file
[COPCLoader] ✓ Root node intersects spatial bounds, proceeding with load
[COPCLoader] ✅ Loaded 299,043 points from 34 nodes
```

## Performance Results

Using tiled COPC files with Test Config T049 (Sahara region):

- **Tiles checked**: 4
- **Tiles skipped**: 3 (via root node intersection)
- **Tiles loaded**: 1 (north_mid: 0° to 30° latitude)
- **Points loaded**: 299,043 (from 34 octree nodes)
- **Data reduction**: 94.5% (via spatial filtering)
- **Load time**: Fast (confirmed by user)

## Batch Processing Example

Convert all 7 CALIPSO files from 2023-06-30:

```bash
# Using Python script
python convert_las_to_tiled_copc.py --all \
  /path/to/las_files \
  ./public/data/tiled

# Or using bash wrapper
./batch_convert_to_tiled_copc.sh \
  /path/to/las_files \
  ./public/data/tiled
```

Output: 28 COPC files (7 timestamps × 4 tiles)

## Troubleshooting

### Issue: "PDAL not found"

```bash
# Activate conda environment
conda activate pdal

# Verify installation
which pdal
pdal --version
```

### Issue: "Invalid SRS"

Ensure input LAS files have EPSG:4326 set:

```bash
pdal info input.las | grep "srs"
```

If missing, add to pipeline:
```json
{
  "type": "filters.reprojection",
  "in_srs": "EPSG:4326",
  "out_srs": "EPSG:4326"
}
```

### Issue: "Empty tile"

Some tiles may have 0 points if the satellite track doesn't cross that latitude range. This is normal and the viewer filters out empty tiles automatically.

## References

- **Jupyter Notebook**: [data/calipso_las_to_tiled_copc_conversion.ipynb](data/calipso_las_to_tiled_copc_conversion.ipynb)
- **PDAL COPC Writer**: https://pdal.io/en/stable/stages/writers.copc.html
- **COPC Specification**: https://copc.io/

## Summary

Latitude tiling solves COPC cube corruption for globe-spanning data by:
1. Splitting LAS files into 4 manageable latitude ranges
2. Creating valid COPC octrees for each tile
3. Enabling root node intersection checking
4. Achieving 75% reduction in tiles loaded + 94.5% reduction in points loaded
5. Maintaining fast, responsive visualization
