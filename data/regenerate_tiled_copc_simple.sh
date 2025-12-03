#!/bin/bash

# Regenerate Tiled COPC Files with Proper Latitude Filtering
# This script fixes corrupted octree cube bounds by splitting LAS files
# into latitude tiles BEFORE running the COPC writer

set -e

# Configuration
INPUT_DIR="/Users/klesinger/github/deckGL/callipsoPotree/data/converted_las"
OUTPUT_DIR="/Users/klesinger/github/deckGL/callipsoPotree/data/final/tiled"
PDAL_BIN="/opt/anaconda3/envs/pdal/bin/pdal"

# Activate conda environment
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate pdal

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "=================================="
echo "Regenerating Tiled COPC Files"
echo "=================================="
echo "Input:  $INPUT_DIR"
echo "Output: $OUTPUT_DIR"
echo ""

# Function to process one tile
process_tile() {
    local las_file="$1"
    local tile_name="$2"
    local lat_range="$3"
    local basename=$(basename "$las_file" .las)
    local output_file="$OUTPUT_DIR/${basename}_tile_${tile_name}.copc.laz"

    echo "  Creating tile: $tile_name (lat $lat_range)"

    # Create PDAL pipeline JSON
    cat > /tmp/pdal_pipeline_${tile_name}.json << EOF
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "$las_file"
    },
    {
      "type": "filters.range",
      "limits": "Y[$lat_range]"
    },
    {
      "type": "filters.stats",
      "dimensions": "X,Y,Z,Intensity"
    },
    {
      "type": "writers.copc",
      "filename": "$output_file",
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
EOF

    # Run PDAL pipeline
    "$PDAL_BIN" pipeline /tmp/pdal_pipeline_${tile_name}.json

    # Clean up temp file
    rm /tmp/pdal_pipeline_${tile_name}.json

    # Get file size
    size=$(du -h "$output_file" | cut -f1)
    echo "    ✓ Created: ${tile_name} ($size)"
}

# Process each LAS file
for las_file in "$INPUT_DIR"/*.las; do
    if [ ! -f "$las_file" ]; then
        continue
    fi

    basename=$(basename "$las_file" .las)
    echo "Processing: $basename"

    # Create 4 latitude tiles for this file
    process_tile "$las_file" "south" "-90:-30"
    process_tile "$las_file" "south_mid" "-30:0"
    process_tile "$las_file" "north_mid" "0:30"
    process_tile "$las_file" "north" "30:90"

    echo ""
done

echo "=================================="
echo "✅ Tiled COPC Regeneration Complete!"
echo "=================================="
echo ""
echo "Output files in: $OUTPUT_DIR"
echo ""
echo "To verify cube bounds are valid:"
echo "  pdal info $OUTPUT_DIR/*_tile_north.copc.laz --metadata | grep -A 10 'cube'"
