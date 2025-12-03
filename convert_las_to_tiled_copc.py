#!/usr/bin/env python3
"""
Convert existing CALIPSO LAS files to tiled COPC format.

This splits LAS files into 4 latitude tiles to avoid COPC cube calculation issues
with globe-spanning data.
"""

import sys
import subprocess
import json
from pathlib import Path

def split_las_to_tiles(las_path, output_dir):
    """
    Split a LAS file into 4 latitude tiles and convert each to COPC.

    Args:
        las_path: Path to input LAS file
        output_dir: Output directory for tiled COPC files
    """
    las_path = Path(las_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(exist_ok=True, parents=True)

    # Define latitude tiles (4 tiles covering globe)
    tiles = [
        {'name': 'south', 'lat_min': -90, 'lat_max': -30},
        {'name': 'south_mid', 'lat_min': -30, 'lat_max': 0},
        {'name': 'north_mid', 'lat_min': 0, 'lat_max': 30},
        {'name': 'north', 'lat_min': 30, 'lat_max': 90}
    ]

    base_name = las_path.stem

    print(f"\n{'='*80}")
    print(f"Converting {las_path.name} to tiled COPC files...")
    print(f"Output directory: {output_dir}")
    print(f"Creating {len(tiles)} latitude tiles")
    print(f"{'='*80}\n")

    pdal_path = '/opt/anaconda3/envs/pdal/bin/pdal'

    for tile in tiles:
        tile_name = f"{base_name}_tile_{tile['name']}"
        copc_path = output_dir / f"{tile_name}.copc.laz"

        filter_desc = f"lat: {tile['lat_min']}° to {tile['lat_max']}°"

        print(f"Processing tile: {tile['name']} ({filter_desc})")

        # Create PDAL pipeline to filter by latitude and convert to COPC
        # In LAS files, Y dimension is latitude in EPSG:4326
        pipeline = {
            "pipeline": [
                {
                    "type": "readers.las",
                    "filename": str(las_path)
                },
                {
                    "type": "filters.range",
                    "limits": f"Y[{tile['lat_min']}:{tile['lat_max']}]"
                },
                {
                    "type": "filters.stats",
                    "dimensions": "X,Y,Z,Intensity"
                },
                {
                    "type": "writers.copc",
                    "filename": str(copc_path),
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

        try:
            pipeline_json = json.dumps(pipeline)

            result = subprocess.run(
                [pdal_path, 'pipeline', '--stdin'],
                input=pipeline_json.encode(),
                capture_output=True,
                check=True
            )

            # Get file size
            size_mb = copc_path.stat().st_size / (1024 * 1024)
            print(f"  ✓ Created {copc_path.name} ({size_mb:.1f} MB)")

        except subprocess.CalledProcessError as e:
            print(f"  ✗ Error: {e}")
            print(f"  stderr: {e.stderr.decode()}")
            continue
        except Exception as e:
            print(f"  ✗ Error: {e}")
            continue

    print(f"\n{'='*80}")
    print("Tile conversion complete!")
    print(f"Output directory: {output_dir}")
    print(f"{'='*80}\n")


def process_all_las_files(las_dir, output_dir):
    """
    Process all LAS files in a directory, creating tiled COPC files for each.

    Args:
        las_dir: Directory containing LAS files
        output_dir: Output directory for tiled COPC files
    """
    las_dir = Path(las_dir)
    las_files = sorted(las_dir.glob('*.las'))

    if not las_files:
        print(f"No LAS files found in {las_dir}")
        return

    print(f"\nFound {len(las_files)} LAS files to process")
    print(f"Input directory: {las_dir}")
    print(f"Output directory: {output_dir}\n")

    for i, las_file in enumerate(las_files, 1):
        print(f"\n[{i}/{len(las_files)}] Processing {las_file.name}")
        split_las_to_tiles(las_file, output_dir)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  Single file:  python convert_las_to_tiled_copc.py <input.las> [output_dir]")
        print("  All files:    python convert_las_to_tiled_copc.py --all <las_dir> <output_dir>")
        print("\nThis script creates 4 latitude-based COPC tiles:")
        print("  - south:      -90° to -30°")
        print("  - south_mid:  -30° to 0°")
        print("  - north_mid:   0° to 30°")
        print("  - north:      30° to 90°")
        print("\nLatitude tiling avoids COPC cube calculation issues for orbital data.")
        sys.exit(1)

    try:
        if sys.argv[1] == '--all':
            if len(sys.argv) < 4:
                print("Error: --all requires <las_dir> and <output_dir>")
                sys.exit(1)
            las_dir = sys.argv[2]
            output_dir = sys.argv[3]
            process_all_las_files(las_dir, output_dir)
        else:
            input_file = sys.argv[1]
            output_dir = sys.argv[2] if len(sys.argv) > 2 else 'public/potree_data/tiled'
            split_las_to_tiles(input_file, output_dir)

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
