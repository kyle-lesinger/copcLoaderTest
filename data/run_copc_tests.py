#!/usr/bin/env python3
"""
COPC Test Runner - Generate configuration files for visualization testing
Helps apply test configurations and track results
"""

import json
import csv
from pathlib import Path
from datetime import datetime

# Load test configurations
with open('copc_test_configurations.json', 'r') as f:
    config = json.load(f)

def generate_test_summary():
    """Generate a readable summary of all tests"""
    tests = config['test_configurations']

    print("="*80)
    print("COPC VISUALIZATION TEST SUITE")
    print("="*80)
    print(f"\nTotal tests: {len(tests)}")
    print(f"Target file: {config['metadata']['target_file']}")
    print(f"Spatial filter: Lat {config['metadata']['spatial_filter']['latitude_range']}, "
          f"Lon {config['metadata']['spatial_filter']['longitude_range']}")

    print("\n" + "="*80)
    print("TEST CATEGORIES")
    print("="*80)

    categories = {}
    for test in tests:
        # Extract category from name
        if 'Mobile' in test['name']:
            cat = 'Mobile'
        elif 'Desktop' in test['name']:
            cat = 'Desktop'
        elif 'Balanced' in test['name']:
            cat = 'Balanced'
        elif 'Progressive' in test['name']:
            cat = 'Progressive'
        elif 'Decimation' in test['name']:
            cat = 'Decimation'
        elif 'Altitude' in test['name']:
            cat = 'Altitude Filters'
        elif 'Backscatter' in test['name']:
            cat = 'Backscatter Filters'
        elif 'Recommended' in test['name']:
            cat = 'Recommended'
        elif 'Detail' in test['name']:
            cat = 'Detail Levels'
        elif 'Budget' in test['name']:
            cat = 'Point Budget'
        else:
            cat = 'Other'

        if cat not in categories:
            categories[cat] = []
        categories[cat].append(test)

    for cat, tests_in_cat in sorted(categories.items()):
        print(f"\n{cat}: {len(tests_in_cat)} tests")
        for test in tests_in_cat[:3]:  # Show first 3
            print(f"  - {test['test_id']}: {test['name']}")
        if len(tests_in_cat) > 3:
            print(f"  ... and {len(tests_in_cat) - 3} more")

def print_test_details(test_id):
    """Print detailed information about a specific test"""
    tests = config['test_configurations']
    test = next((t for t in tests if t['test_id'] == test_id), None)

    if not test:
        print(f"Test {test_id} not found!")
        return

    print("\n" + "="*80)
    print(f"TEST {test['test_id']}: {test['name']}")
    print("="*80)

    print(f"\nUse Case: {test['use_case']}")
    print(f"Expected FPS: {test['expected_fps']}")

    print("\nConfiguration:")
    print(f"  Max Depth: {test['max_depth']}")
    print(f"  Point Budget: {test['point_budget']:,}")
    print(f"  LOD Strategy: {test['lod_strategy']}")
    print(f"  LOD Threshold: {test['lod_threshold']}")
    print(f"  Decimation: {test['decimation']}")

    # Print additional settings if present
    for key in ['progressive_settings', 'distance_weights', 'altitude_filter',
                'backscatter_filter', 'adaptive_settings', 'prefetch_settings',
                'cache_settings', 'render_settings', 'hybrid_settings']:
        if key in test:
            print(f"\n{key.replace('_', ' ').title()}:")
            for k, v in test[key].items():
                print(f"  {k}: {v}")

def generate_results_csv():
    """Generate a CSV template for recording results"""
    output_file = 'copc_test_results.csv'

    fieldnames = [
        'test_id',
        'test_name',
        'timestamp',
        'gpu',
        'ram_gb',
        'browser',
        'initial_load_time_ms',
        'average_fps',
        'min_fps',
        'max_fps',
        'memory_usage_mb',
        'visual_quality_score',
        'navigation_smoothness_score',
        'visible_point_count',
        'loaded_node_count',
        'notes'
    ]

    with open(output_file, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        # Add template rows for each test
        for test in config['test_configurations']:
            writer.writerow({
                'test_id': test['test_id'],
                'test_name': test['name'],
                'timestamp': '',
                'gpu': '',
                'ram_gb': '',
                'browser': '',
                'initial_load_time_ms': '',
                'average_fps': '',
                'min_fps': '',
                'max_fps': '',
                'memory_usage_mb': '',
                'visual_quality_score': '',
                'navigation_smoothness_score': '',
                'visible_point_count': '',
                'loaded_node_count': '',
                'notes': ''
            })

    print(f"\n✅ Created results CSV template: {output_file}")
    print(f"   Record your test results in this file")

def generate_quick_reference():
    """Generate a quick reference guide"""
    output_file = 'copc_test_quick_reference.txt'

    with open(output_file, 'w') as f:
        f.write("COPC VISUALIZATION TEST SUITE - QUICK REFERENCE\n")
        f.write("="*80 + "\n\n")

        f.write("PRESET CONFIGURATION:\n")
        f.write("-"*80 + "\n")
        f.write("File: CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz\n")
        f.write("Latitude Range: -20 to 20 degrees\n")
        f.write("Longitude Range: -30 to 30 degrees\n")
        f.write("Region: Equatorial (tropical atmospheric features)\n\n")

        f.write("RECOMMENDED STARTING TESTS:\n")
        f.write("-"*80 + "\n")
        recommended = [t for t in config['test_configurations'] if t.get('recommended')]
        for test in recommended:
            f.write(f"{test['test_id']}: {test['name']}\n")
            f.write(f"  - {test['use_case']}\n")
            f.write(f"  - Depth: {test['max_depth']}, Budget: {test['point_budget']:,}, "
                   f"Expected FPS: {test['expected_fps']}\n\n")

        f.write("\nALL TESTS BY CATEGORY:\n")
        f.write("="*80 + "\n\n")

        # Group by expected FPS
        fps_groups = {
            '60 FPS': [],
            '45-60 FPS': [],
            '30-45 FPS': [],
            'Below 30 FPS': []
        }

        for test in config['test_configurations']:
            fps = test['expected_fps']
            if '60' in fps and '45' not in fps:
                fps_groups['60 FPS'].append(test)
            elif '45-60' in fps:
                fps_groups['45-60 FPS'].append(test)
            elif '30' in fps:
                if '15' in fps or '<' in fps:
                    fps_groups['Below 30 FPS'].append(test)
                else:
                    fps_groups['30-45 FPS'].append(test)
            else:
                fps_groups['Below 30 FPS'].append(test)

        for group_name, tests in fps_groups.items():
            if tests:
                f.write(f"{group_name} ({len(tests)} tests):\n")
                f.write("-"*80 + "\n")
                for test in tests:
                    f.write(f"{test['test_id']}: {test['name']:<45} "
                           f"(Depth: {test['max_depth']}, Budget: {test['point_budget']:>9,})\n")
                f.write("\n")

        f.write("\nTESTING WORKFLOW:\n")
        f.write("="*80 + "\n")
        f.write("1. Start with recommended tests (T049, T050)\n")
        f.write("2. If too slow, try lower depth/budget tests (T001-T003)\n")
        f.write("3. If too fast, try higher depth/budget tests (T004-T007)\n")
        f.write("4. Test specific features:\n")
        f.write("   - Altitude filters: T034-T037\n")
        f.write("   - Backscatter filters: T038-T039\n")
        f.write("   - Progressive loading: T018-T020\n")
        f.write("   - Mobile optimization: T027-T028\n")
        f.write("5. Record results in copc_test_results.csv\n")

    print(f"✅ Created quick reference: {output_file}")

def export_test_config_for_js(test_id):
    """Export a specific test configuration in JavaScript format"""
    tests = config['test_configurations']
    test = next((t for t in tests if t['test_id'] == test_id), None)

    if not test:
        print(f"Test {test_id} not found!")
        return

    js_config = f"""
// Test Configuration: {test['test_id']} - {test['name']}
const testConfig = {{
  // Spatial Filter
  spatialFilter: {{
    latitudeRange: {config['metadata']['spatial_filter']['latitude_range']},
    longitudeRange: {config['metadata']['spatial_filter']['longitude_range']}
  }},

  // COPC File
  copcFile: "{config['metadata']['target_file']}",

  // Loading Parameters
  maxDepth: {test['max_depth']},
  pointBudget: {test['point_budget']},
  lodStrategy: "{test['lod_strategy']}",
  lodThreshold: {test['lod_threshold']},
  decimation: "{test['decimation']}",

  // Expected Performance
  expectedFps: "{test['expected_fps']}",
  useCase: "{test['use_case']}"
}};

// Usage with deck.gl:
/*
const layer = new PointCloudLayer({{
  id: 'calipso-copc',
  data: loadCOPCWithConfig(testConfig),
  // ... other layer properties
}});
*/
"""

    output_file = f'test_{test_id}_config.js'
    with open(output_file, 'w') as f:
        f.write(js_config)

    print(f"✅ Exported JavaScript config: {output_file}")
    print(js_config)

if __name__ == "__main__":
    print("\n" + "="*80)
    print("COPC TEST SUITE HELPER")
    print("="*80)

    # Generate all helper files
    generate_test_summary()
    print("\n")
    generate_results_csv()
    generate_quick_reference()

    print("\n" + "="*80)
    print("NEXT STEPS")
    print("="*80)
    print("\n1. Review 'copc_test_quick_reference.txt' for an overview")
    print("2. Start with recommended tests (T049 or T050)")
    print("3. Record results in 'copc_test_results.csv'")
    print("\nTo see details for a specific test, run:")
    print("  python run_copc_tests.py --test T049")

    print("\n" + "="*80)
    print("RECOMMENDED STARTING TESTS:")
    print("="*80)
    print("\nT049: Fast, guaranteed 60 FPS")
    print_test_details("T049")

    print("\nT050: Balanced quality/performance")
    print_test_details("T050")
