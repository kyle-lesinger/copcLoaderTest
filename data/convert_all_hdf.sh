#!/bin/bash
#
# Convert all CALIPSO HDF files in data/ to COPC format
#
# Directory structure:
#   data/               - Raw HDF files
#   data/converted_las/ - Intermediate LAS files
#   data/final/         - Final COPC files
#

set -e

# Activate conda environment
source /opt/anaconda3/etc/profile.d/conda.sh
conda activate pdal

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Batch Converting CALIPSO HDF files to COPC"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Count HDF files
HDF_COUNT=$(find raw -maxdepth 1 -name "*.hdf" -type f | wc -l)
echo "Found ${HDF_COUNT} HDF files to convert"
echo ""

CURRENT=0
for HDF_FILE in raw/*.hdf; do
    CURRENT=$((CURRENT + 1))
    BASENAME=$(basename "$HDF_FILE" .hdf)

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Processing file ${CURRENT}/${HDF_COUNT}: ${BASENAME}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    LAS_PATH="converted_las/${BASENAME}.las"
    COPC_PATH="final/${BASENAME}.copc.laz"

    # Step 1: Convert HDF to LAS (always re-run)
    echo "Step 1/2: Converting HDF to LAS..."
    python3 calipso_to_las.py "${HDF_FILE}" "${LAS_PATH}"

    # Step 2: Convert LAS to COPC
    echo "Step 2/2: Converting LAS to COPC..."
    pdal pipeline las_to_copc_fixed.json \
        --readers.las.filename="${LAS_PATH}" \
        --writers.copc.filename="${COPC_PATH}"

    echo "✅ Completed: ${BASENAME}"
    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Batch conversion complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Summary:"
echo "  Raw HDF files:   raw/*.hdf"
echo "  LAS files:       converted_las/*.las"
echo "  COPC files:      final/*.copc.laz"
echo ""

# Show output files
echo "Generated COPC files:"
ls -lh final/*.copc.laz 2>/dev/null || echo "No COPC files generated yet"
