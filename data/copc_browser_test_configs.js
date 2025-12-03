/**
 * COPC Browser Visualization Test Configurations
 *
 * Use these presets in your deck.gl application to test different
 * COPC loading strategies for optimal performance.
 *
 * Target Region: Equatorial (-20 to 20 lat, -30 to 30 lon)
 * Target File: CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz
 */

export const COPC_TEST_CONFIGS = {

  // ========================================================================
  // PRESET SPATIAL FILTERS
  // ========================================================================

  SPATIAL_PRESETS: {
    equatorial: {
      filename: "CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz",
      bounds: {
        minLat: -20,
        maxLat: 20,
        minLon: -30,
        maxLon: 30
      },
      description: "Equatorial region - tropical atmospheric features"
    }
  },

  // ========================================================================
  // RECOMMENDED STARTING POINTS (Try these first!)
  // ========================================================================

  RECOMMENDED: {

    T049_fast: {
      testId: "T049",
      name: "Recommended - Fast (60 FPS guaranteed)",
      maxDepth: 3,
      pointBudget: 1000000,
      lodStrategy: "frustum_and_distance",
      lodThreshold: 15,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Best for smooth navigation and presentations"
    },

    T050_balanced: {
      testId: "T050",
      name: "Recommended - Balanced (Best quality/performance)",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "screen_space_error",
      lodThreshold: 2.0,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Best overall default configuration"
    }
  },

  // ========================================================================
  // DETAIL LEVEL TESTS (Progressive complexity)
  // ========================================================================

  DETAIL_LEVELS: {

    T001_minimal: {
      testId: "T001",
      name: "Minimal - Very Low Detail",
      maxDepth: 0,
      pointBudget: 100000,
      lodStrategy: "distance_based",
      lodThreshold: 100,
      decimation: null,
      pointSize: 3,
      expectedFps: 60,
      useCase: "Initial overview, fastest loading"
    },

    T002_low: {
      testId: "T002",
      name: "Low Detail - Root + Level 1",
      maxDepth: 1,
      pointBudget: 250000,
      lodStrategy: "distance_based",
      lodThreshold: 50,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Quick preview with some spatial detail"
    },

    T003_medium: {
      testId: "T003",
      name: "Medium Detail - Depth 2",
      maxDepth: 2,
      pointBudget: 500000,
      lodStrategy: "distance_based",
      lodThreshold: 25,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Good balance for interactive exploration"
    },

    T004_high: {
      testId: "T004",
      name: "High Detail - Depth 3",
      maxDepth: 3,
      pointBudget: 1000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Detailed view for analysis"
    },

    T005_very_high: {
      testId: "T005",
      name: "Very High Detail - Depth 4",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "distance_based",
      lodThreshold: 5,
      decimation: null,
      pointSize: 2,
      expectedFps: 40,
      useCase: "Maximum detail, may impact performance"
    },

    T006_ultra: {
      testId: "T006",
      name: "Ultra Detail - Depth 5",
      maxDepth: 5,
      pointBudget: 5000000,
      lodStrategy: "distance_based",
      lodThreshold: 2,
      decimation: null,
      pointSize: 1,
      expectedFps: 25,
      useCase: "Scientific analysis, expect slowdown"
    },

    T007_maximum: {
      testId: "T007",
      name: "Maximum Detail - All Levels",
      maxDepth: 10,
      pointBudget: 10000000,
      lodStrategy: "frustum_only",
      lodThreshold: 0,
      decimation: null,
      pointSize: 1,
      expectedFps: 10,
      useCase: "Stress test, likely too slow"
    }
  },

  // ========================================================================
  // POINT BUDGET TESTS (Fixed budget, auto depth)
  // ========================================================================

  BUDGET_TESTS: {

    T008_budget_500k: {
      testId: "T008",
      name: "Budget Limited - 500K points",
      maxDepth: 10,
      pointBudget: 500000,
      lodStrategy: "distance_based",
      lodThreshold: 20,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Strict performance target"
    },

    T009_budget_1M: {
      testId: "T009",
      name: "Budget Limited - 1M points",
      maxDepth: 10,
      pointBudget: 1000000,
      lodStrategy: "distance_based",
      lodThreshold: 15,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Good performance target"
    },

    T010_budget_2M: {
      testId: "T010",
      name: "Budget Limited - 2M points",
      maxDepth: 10,
      pointBudget: 2000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Balanced performance"
    },

    T011_budget_3M: {
      testId: "T011",
      name: "Budget Limited - 3M points",
      maxDepth: 10,
      pointBudget: 3000000,
      lodStrategy: "distance_based",
      lodThreshold: 8,
      decimation: null,
      pointSize: 2,
      expectedFps: 40,
      useCase: "High detail with acceptable FPS"
    },

    T012_budget_5M: {
      testId: "T012",
      name: "Budget Limited - 5M points",
      maxDepth: 10,
      pointBudget: 5000000,
      lodStrategy: "distance_based",
      lodThreshold: 5,
      decimation: null,
      pointSize: 2,
      expectedFps: 30,
      useCase: "Maximum detail while maintaining 30 FPS"
    }
  },

  // ========================================================================
  // MOBILE OPTIMIZED (For tablets/phones)
  // ========================================================================

  MOBILE: {

    T027_mobile_low: {
      testId: "T027",
      name: "Mobile - Low End",
      maxDepth: 2,
      pointBudget: 300000,
      lodStrategy: "distance_based",
      lodThreshold: 30,
      decimation: "every_2nd",
      pointSize: 3,
      expectedFps: 60,
      useCase: "Mobile devices with limited GPU"
    },

    T028_mobile_medium: {
      testId: "T028",
      name: "Mobile - Modern",
      maxDepth: 3,
      pointBudget: 500000,
      lodStrategy: "distance_based",
      lodThreshold: 20,
      decimation: "random_50",
      pointSize: 2,
      expectedFps: 50,
      useCase: "Modern mobile devices"
    }
  },

  // ========================================================================
  // DESKTOP OPTIMIZED
  // ========================================================================

  DESKTOP: {

    T029_desktop_standard: {
      testId: "T029",
      name: "Desktop - Standard GPU",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "screen_space_error",
      lodThreshold: 2.0,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Standard desktop GPU (GTX 1060, RX 580)"
    },

    T030_desktop_high_end: {
      testId: "T030",
      name: "Desktop - High End GPU",
      maxDepth: 5,
      pointBudget: 5000000,
      lodStrategy: "screen_space_error",
      lodThreshold: 1.0,
      decimation: null,
      pointSize: 1,
      expectedFps: 60,
      useCase: "High-end desktop GPU (RTX 3080+, RX 6800+)"
    }
  },

  // ========================================================================
  // ALTITUDE FILTERS (Focus on specific atmospheric layers)
  // ========================================================================

  ALTITUDE_FILTERS: {

    T034_surface: {
      testId: "T034",
      name: "Surface Layer (0-10km)",
      maxDepth: 3,
      pointBudget: 1000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 60,
      useCase: "Focus on low altitude clouds",
      altitudeFilter: {
        minAltitudeKm: 0,
        maxAltitudeKm: 10
      }
    },

    T035_troposphere: {
      testId: "T035",
      name: "Troposphere (0-15km)",
      maxDepth: 4,
      pointBudget: 1500000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Troposphere weather analysis",
      altitudeFilter: {
        minAltitudeKm: 0,
        maxAltitudeKm: 15
      }
    },

    T036_stratosphere: {
      testId: "T036",
      name: "Stratosphere (15-30km)",
      maxDepth: 4,
      pointBudget: 1500000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Stratosphere analysis",
      altitudeFilter: {
        minAltitudeKm: 15,
        maxAltitudeKm: 30
      }
    },

    T037_full_column: {
      testId: "T037",
      name: "Full Atmospheric Column (0-40km)",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 40,
      useCase: "Full atmospheric column",
      altitudeFilter: {
        minAltitudeKm: 0,
        maxAltitudeKm: 40
      }
    }
  },

  // ========================================================================
  // BACKSCATTER FILTERS (Feature detection)
  // ========================================================================

  BACKSCATTER_FILTERS: {

    T038_clouds_only: {
      testId: "T038",
      name: "Clouds Only (High Backscatter)",
      maxDepth: 4,
      pointBudget: 1000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 3,
      expectedFps: 60,
      useCase: "Filter for cloud features",
      backscatterFilter: {
        minBackscatter532: 0.001,
        maxBackscatter532: 3.0
      }
    },

    T039_aerosols: {
      testId: "T039",
      name: "Aerosols (Medium Backscatter)",
      maxDepth: 4,
      pointBudget: 1500000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: null,
      pointSize: 2,
      expectedFps: 50,
      useCase: "Filter for aerosol layers",
      backscatterFilter: {
        minBackscatter532: 0.0001,
        maxBackscatter532: 0.01
      }
    }
  },

  // ========================================================================
  // DECIMATION TESTS (Point reduction strategies)
  // ========================================================================

  DECIMATION: {

    T021_every_2nd: {
      testId: "T021",
      name: "Decimation - Every 2nd Point",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: "every_2nd",
      pointSize: 2,
      expectedFps: 60,
      useCase: "50% point reduction for performance"
    },

    T022_every_3rd: {
      testId: "T022",
      name: "Decimation - Every 3rd Point",
      maxDepth: 5,
      pointBudget: 3000000,
      lodStrategy: "distance_based",
      lodThreshold: 8,
      decimation: "every_3rd",
      pointSize: 2,
      expectedFps: 60,
      useCase: "67% point reduction for high depth"
    },

    T023_random_50: {
      testId: "T023",
      name: "Decimation - Random 50%",
      maxDepth: 4,
      pointBudget: 2000000,
      lodStrategy: "distance_based",
      lodThreshold: 10,
      decimation: "random_50",
      pointSize: 2,
      expectedFps: 60,
      useCase: "Random sampling for better distribution"
    }
  }
};

// ========================================================================
// HELPER FUNCTIONS
// ========================================================================

/**
 * Get a test configuration by ID
 * @param {string} testId - e.g., "T049", "T050"
 * @returns {object} Test configuration
 */
export function getTestConfig(testId) {
  for (const category of Object.values(COPC_TEST_CONFIGS)) {
    for (const [key, config] of Object.entries(category)) {
      if (config.testId === testId) {
        return { ...config, ...COPC_TEST_CONFIGS.SPATIAL_PRESETS.equatorial };
      }
    }
  }
  return null;
}

/**
 * Get all test configurations as a flat array
 * @returns {Array} All test configurations
 */
export function getAllTests() {
  const tests = [];
  for (const category of Object.values(COPC_TEST_CONFIGS)) {
    if (category !== COPC_TEST_CONFIGS.SPATIAL_PRESETS) {
      for (const config of Object.values(category)) {
        tests.push({ ...config, ...COPC_TEST_CONFIGS.SPATIAL_PRESETS.equatorial });
      }
    }
  }
  return tests;
}

/**
 * Get tests filtered by expected FPS
 * @param {number} minFps - Minimum FPS threshold
 * @returns {Array} Filtered test configurations
 */
export function getTestsByFps(minFps) {
  return getAllTests().filter(test => test.expectedFps >= minFps);
}

// ========================================================================
// USAGE EXAMPLE
// ========================================================================

/*
// In your deck.gl application:

import { COPC_TEST_CONFIGS, getTestConfig } from './copc_browser_test_configs.js';

// Get recommended config
const config = getTestConfig('T050');

// Apply to your COPC loader
const copcLayer = new PointCloudLayer({
  id: 'calipso-copc',
  data: loadCOPC({
    file: config.filename,
    bounds: config.bounds,
    maxDepth: config.maxDepth,
    pointBudget: config.pointBudget,
    lodStrategy: config.lodStrategy
  }),
  getPosition: d => [d.x, d.y, d.z],
  getColor: d => colorByBackscatter(d.backscatter_532),
  pointSize: config.pointSize
});

// Track performance
console.log(`Testing: ${config.name}`);
console.log(`Expected FPS: ${config.expectedFps}`);
console.log(`Use Case: ${config.useCase}`);
*/

// Default export
export default COPC_TEST_CONFIGS;
