#!/bin/bash
#
# Batch convert CALIPSO HDF files to tiled COPC format
#
# Complete pipeline: HDF → LAS → 4 Tiled COPC Files
#
# Usage:
#   ./batch_convert_hdf_to_tiled_copc.sh [hdf_dir] [output_dir]
#
# Example:
#   ./batch_convert_hdf_to_tiled_copc.sh ./data/raw ./data/final/tiled_copc
#

set -e  # Exit on error

# Default directories
HDF_DIR="${1:-./raw}"
OUTPUT_DIR="${2:-../public/data/tiled}"
LAS_DIR="./converted_las"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  CALIPSO HDF to Tiled COPC Batch Conversion                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${CYAN}Pipeline: HDF4 → LAS 1.4 → 4 Tiled COPC Files${NC}"
echo ""
echo "HDF input directory:   ${HDF_DIR}"
echo "LAS temp directory:    ${LAS_DIR}"
echo "COPC output directory: ${OUTPUT_DIR}"
echo ""

# Check if HDF directory exists
if [ ! -d "$HDF_DIR" ]; then
    echo -e "${RED}Error: HDF directory does not exist: ${HDF_DIR}${NC}"
    exit 1
fi

# Create output directories
mkdir -p "$LAS_DIR"
mkdir -p "$OUTPUT_DIR"

# Check if Python conversion script exists
PYTHON_SCRIPT="./calipso_to_las.py"
if [ ! -f "$PYTHON_SCRIPT" ]; then
    echo -e "${RED}Error: Python script not found: ${PYTHON_SCRIPT}${NC}"
    echo "Please ensure calipso_to_las.py is in the current directory."
    exit 1
fi

# Find all HDF files
HDF_FILES=("$HDF_DIR"/*.hdf)

# Check if any HDF files were found
if [ ! -e "${HDF_FILES[0]}" ]; then
    echo -e "${RED}No HDF files found in ${HDF_DIR}${NC}"
    exit 1
fi

FILE_COUNT=${#HDF_FILES[@]}
echo -e "${BLUE}Found ${FILE_COUNT} HDF file(s) to process${NC}"
echo ""

# Activate conda environment
echo -e "${YELLOW}Activating PDAL conda environment...${NC}"
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate pdal

# Check PDAL
PDAL_BIN='/opt/anaconda3/envs/pdal/bin/pdal'
if ! command -v "$PDAL_BIN" &> /dev/null; then
    echo -e "${RED}Error: PDAL not found at ${PDAL_BIN}${NC}"
    exit 1
fi

echo -e "${GREEN}✓ PDAL found: $(pdal --version | head -1)${NC}"
echo ""

# Define latitude tiles (tile_name:lat_min:lat_max)
TILES=(
  "south:-90:-30"
  "south_mid:-30:0"
  "north_mid:0:30"
  "north:30:90"
)

# Process each HDF file
CURRENT=0
SUCCESSFUL=0
FAILED=0
TOTAL_COPC_SIZE=0

for HDF_FILE in "${HDF_FILES[@]}"; do
    CURRENT=$((CURRENT + 1))
    BASENAME=$(basename "$HDF_FILE" .hdf)

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "${BLUE}Processing file ${CURRENT}/${FILE_COUNT}: ${BASENAME}${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    LAS_FILE="${LAS_DIR}/${BASENAME}.las"

    # ==========================================
    # STEP 1: HDF → LAS
    # ==========================================
    echo ""
    echo -e "${CYAN}[Step 1/2] HDF → LAS conversion${NC}"

    if [ -f "$LAS_FILE" ]; then
        echo -e "${YELLOW}  ⚠️  LAS file already exists, skipping HDF conversion${NC}"
        echo "  Using existing: ${LAS_FILE}"
    else
        echo "  Converting HDF to LAS..."

        if python "$PYTHON_SCRIPT" "$HDF_FILE" "$LAS_FILE"; then
            LAS_SIZE_MB=$(du -m "$LAS_FILE" | cut -f1)
            echo -e "${GREEN}  ✓ Created ${LAS_FILE} (${LAS_SIZE_MB} MB)${NC}"
        else
            echo -e "${RED}  ✗ Failed to convert HDF to LAS${NC}"
            FAILED=$((FAILED + 1))
            continue
        fi
    fi

    # ==========================================
    # STEP 2: LAS → Tiled COPC
    # ==========================================
    echo ""
    echo -e "${CYAN}[Step 2/2] LAS → 4 Tiled COPC files${NC}"
    echo "  Creating latitude-based tiles:"
    echo "    • south:      -90° to -30°"
    echo "    • south_mid:  -30° to   0°"
    echo "    • north_mid:   0° to  30°"
    echo "    • north:      30° to  90°"
    echo ""

    TILE_COUNT=0
    TILE_SUCCESS=0

    for TILE_SPEC in "${TILES[@]}"; do
        TILE_COUNT=$((TILE_COUNT + 1))
        TILE_NAME=$(echo "$TILE_SPEC" | cut -d: -f1)
        LAT_MIN=$(echo "$TILE_SPEC" | cut -d: -f2)
        LAT_MAX=$(echo "$TILE_SPEC" | cut -d: -f3)
        LAT_RANGE="${LAT_MIN}:${LAT_MAX}"
        COPC_FILE="${OUTPUT_DIR}/${BASENAME}_tile_${TILE_NAME}.copc.laz"

        echo -e "${YELLOW}  [${TILE_COUNT}/4] Processing tile: ${TILE_NAME} (lat ${LAT_MIN}° to ${LAT_MAX}°)${NC}"

        if [ -f "$COPC_FILE" ]; then
            echo "    ⚠️  COPC file already exists, skipping"
            COPC_SIZE_MB=$(du -m "$COPC_FILE" | cut -f1)
            echo "    Using existing: ${COPC_FILE} (${COPC_SIZE_MB} MB)"
            TILE_SUCCESS=$((TILE_SUCCESS + 1))
            TOTAL_COPC_SIZE=$((TOTAL_COPC_SIZE + COPC_SIZE_MB))
            continue
        fi

        # Create PDAL pipeline
        PIPELINE=$(cat <<EOF
{
  "pipeline": [
    {
      "type": "readers.las",
      "filename": "${LAS_FILE}"
    },
    {
      "type": "filters.range",
      "limits": "Y[${LAT_RANGE}]"
    },
    {
      "type": "filters.stats",
      "dimensions": "X,Y,Z,Intensity"
    },
    {
      "type": "writers.copc",
      "filename": "${COPC_FILE}",
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
)

        # Run PDAL
        if echo "$PIPELINE" | "$PDAL_BIN" pipeline --stdin 2>&1 | grep -q "writers.copc"; then
            if [ -f "$COPC_FILE" ]; then
                COPC_SIZE_MB=$(du -m "$COPC_FILE" | cut -f1)
                echo -e "${GREEN}    ✓ Created ${COPC_FILE##*/} (${COPC_SIZE_MB} MB)${NC}"
                TILE_SUCCESS=$((TILE_SUCCESS + 1))
                TOTAL_COPC_SIZE=$((TOTAL_COPC_SIZE + COPC_SIZE_MB))
            else
                echo -e "${RED}    ✗ Error: Output file not created${NC}"
            fi
        else
            echo -e "${RED}    ✗ PDAL pipeline failed${NC}"
        fi
    done

    echo ""
    if [ $TILE_SUCCESS -eq 4 ]; then
        echo -e "${GREEN}✓ Successfully created 4 tiled COPC files for ${BASENAME}${NC}"
        SUCCESSFUL=$((SUCCESSFUL + 1))
    else
        echo -e "${YELLOW}⚠️  Created ${TILE_SUCCESS}/4 tiled COPC files for ${BASENAME}${NC}"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Batch Conversion Complete                                     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo -e "Total HDF files:  ${FILE_COUNT}"
echo -e "${GREEN}Successful:       ${SUCCESSFUL}${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed:           ${FAILED}${NC}"
else
    echo -e "Failed:           ${FAILED}"
fi
echo ""
echo "Output summary:"
echo "  LAS directory:  ${LAS_DIR}"
echo "  COPC directory: ${OUTPUT_DIR}"
echo "  Total COPC size: ${TOTAL_COPC_SIZE} MB"
echo ""

# List output files
COPC_FILE_COUNT=$(find "$OUTPUT_DIR" -name "*.copc.laz" | wc -l)
echo "Generated COPC files: ${COPC_FILE_COUNT}"
echo ""

if [ $COPC_FILE_COUNT -gt 0 ]; then
    echo "Recent COPC files:"
    ls -lht "$OUTPUT_DIR"/*.copc.laz | head -10
fi

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  1. Update src/utils/fileSearch.ts with new basenames"
echo "  2. Test in web viewer with spatial bounds filter"
echo ""
echo -e "${YELLOW}Note:${NC} Files are already in the correct location for web serving (public/data/tiled/)"
echo ""

exit 0
