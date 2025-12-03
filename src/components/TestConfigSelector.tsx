import { useState } from 'react'
import './TestConfigSelector.css'

export interface TestConfig {
  testId: string
  name: string
  filename: string
  bounds: {
    minLat: number
    maxLat: number
    minLon: number
    maxLon: number
  }
  maxDepth: number
  pointBudget: number
  lodStrategy: string
  lodThreshold: number
  decimation: string | null
  pointSize: number
  expectedFps: number
  useCase: string
}

// Import test configurations
const TEST_CONFIGS: Record<string, TestConfig> = {
  // RECOMMENDED CONFIGS
  T049: {
    testId: 'T049',
    name: 'Recommended - Fast',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -90, maxLat: 90, minLon: -180, maxLon: 180 },  // Global bounds for CALIPSO orbital data
    maxDepth: 3,
    pointBudget: 1000000,
    lodStrategy: 'frustum_and_distance',
    lodThreshold: 15,
    decimation: null,
    pointSize: 2,
    expectedFps: 60,
    useCase: 'Smooth navigation and presentations'
  },

  // DEPTH PROGRESSION TESTS
  T001: {
    testId: 'T001',
    name: 'Depth 0 - Root Only',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -10.1, maxLat: 40.1, minLon: -30.1, maxLon: 30.1 },
    maxDepth: 0,
    pointBudget: 100000,
    lodStrategy: 'distance_based',
    lodThreshold: 100,
    decimation: null,
    pointSize: 3,
    expectedFps: 60,
    useCase: 'Fastest loading, minimal detail'
  },
  T002: {
    testId: 'T002',
    name: 'Depth 1',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -31, maxLat: 40, minLon: -30, maxLon: 30 },  // Consistent bounds for fair depth comparison
    maxDepth: 1,
    pointBudget: 300000,
    lodStrategy: 'distance_based',
    lodThreshold: 50,
    decimation: null,
    pointSize: 2.5,
    expectedFps: 60,
    useCase: 'Very low detail'
  },
  T003: {
    testId: 'T003',
    name: 'Depth 2',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -31, maxLat: 40, minLon: -30, maxLon: 30 },  // Consistent bounds for fair depth comparison
    maxDepth: 2,
    pointBudget: 500000,
    lodStrategy: 'distance_based',
    lodThreshold: 25,
    decimation: null,
    pointSize: 2,
    expectedFps: 60,
    useCase: 'Low detail'
  },
  T004: {
    testId: 'T004',
    name: 'Depth 3',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -31, maxLat: 40, minLon: -30, maxLon: 30 },  // Consistent bounds for fair depth comparison
    maxDepth: 3,
    pointBudget: 1000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 2,
    expectedFps: 55,
    useCase: 'Medium detail'
  },
  T005: {
    testId: 'T005',
    name: 'Depth 4',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -31, maxLat: 40, minLon: -30, maxLon: 30 },  // Consistent bounds for fair depth comparison
    maxDepth: 4,
    pointBudget: 2000000,
    lodStrategy: 'distance_based',
    lodThreshold: 5,
    decimation: null,
    pointSize: 2,
    expectedFps: 50,
    useCase: 'High detail'
  },
  T006: {
    testId: 'T006',
    name: 'Depth 5',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -10.6, maxLat: 40.6, minLon: -30.6, maxLon: 30.6 },
    maxDepth: 5,
    pointBudget: 3000000,
    lodStrategy: 'distance_based',
    lodThreshold: 2,
    decimation: null,
    pointSize: 1.5,
    expectedFps: 40,
    useCase: 'Very high detail'
  },
  T007: {
    testId: 'T007',
    name: 'Depth 6',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -10.7, maxLat: 40.7, minLon: -30.7, maxLon: 30.7 },
    maxDepth: 6,
    pointBudget: 4000000,
    lodStrategy: 'distance_based',
    lodThreshold: 1,
    decimation: null,
    pointSize: 1.2,
    expectedFps: 30,
    useCase: 'Extreme detail'
  },
  T008: {
    testId: 'T008',
    name: 'Depth 7',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -10.8, maxLat: 40.8, minLon: -30.8, maxLon: 30.8 },
    maxDepth: 7,
    pointBudget: 5000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.5,
    decimation: null,
    pointSize: 1.0,
    expectedFps: 25,
    useCase: 'Maximum detail level 7'
  },
  T009: {
    testId: 'T009',
    name: 'Depth 8',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -10.9, maxLat: 40.9, minLon: -30.9, maxLon: 30.9 },
    maxDepth: 8,
    pointBudget: 6000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.3,
    decimation: null,
    pointSize: 1.0,
    expectedFps: 20,
    useCase: 'Maximum detail level 8'
  },
  T009A: {
    testId: 'T009A',
    name: 'Depth 9',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.0, maxLat: 41.0, minLon: -31.0, maxLon: 31.0 },
    maxDepth: 9,
    pointBudget: 7000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.2,
    decimation: null,
    pointSize: 0.8,
    expectedFps: 15,
    useCase: 'Maximum detail level 9 - may be slow'
  },
  T009B: {
    testId: 'T009B',
    name: 'Depth 10',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.1, maxLat: 41.1, minLon: -31.1, maxLon: 31.1 },
    maxDepth: 10,
    pointBudget: 8000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.1,
    decimation: null,
    pointSize: 0.8,
    expectedFps: 10,
    useCase: 'Maximum detail level 10 - very slow'
  },
  T009C: {
    testId: 'T009C',
    name: 'Depth 12 - Unlimited',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.2, maxLat: 41.2, minLon: -31.2, maxLon: 31.2 },
    maxDepth: 12,
    pointBudget: 10000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.05,
    decimation: null,
    pointSize: 0.5,
    expectedFps: 5,
    useCase: 'Full octree depth - extreme performance impact'
  },

  // POINT BUDGET TESTS
  T010: {
    testId: 'T010',
    name: 'Budget: 100K',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.3, maxLat: 41.3, minLon: -31.3, maxLon: 31.3 },
    maxDepth: 4,
    pointBudget: 100000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 2,
    expectedFps: 60,
    useCase: 'Minimal points'
  },
  T011: {
    testId: 'T011',
    name: 'Budget: 500K',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.4, maxLat: 41.4, minLon: -31.4, maxLon: 31.4 },
    maxDepth: 4,
    pointBudget: 500000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 2,
    expectedFps: 60,
    useCase: 'Low point count'
  },
  T012: {
    testId: 'T012',
    name: 'Budget: 1M',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.5, maxLat: 41.5, minLon: -31.5, maxLon: 31.5 },
    maxDepth: 4,
    pointBudget: 1000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 2,
    expectedFps: 55,
    useCase: 'Standard point count'
  },
  T013: {
    testId: 'T013',
    name: 'Budget: 2M',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.6, maxLat: 41.6, minLon: -31.6, maxLon: 31.6 },
    maxDepth: 4,
    pointBudget: 2000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 2,
    expectedFps: 50,
    useCase: 'High point count'
  },
  T014: {
    testId: 'T014',
    name: 'Budget: 5M',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.7, maxLat: 41.7, minLon: -31.7, maxLon: 31.7 },
    maxDepth: 4,
    pointBudget: 5000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 1.5,
    expectedFps: 40,
    useCase: 'Very high point count'
  },
  T015: {
    testId: 'T015',
    name: 'Budget: 10M',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.8, maxLat: 41.8, minLon: -31.8, maxLon: 31.8 },
    maxDepth: 4,
    pointBudget: 10000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 1,
    expectedFps: 30,
    useCase: 'Maximum point count'
  },

  // REGIONAL TESTS
  T030: {
    testId: 'T030',
    name: 'Region: Small (5°×3°)',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: 0, maxLat: 5, minLon: -51, maxLon: -48 },
    maxDepth: 5,
    pointBudget: 2000000,
    lodStrategy: 'distance_based',
    lodThreshold: 5,
    decimation: null,
    pointSize: 1.5,
    expectedFps: 50,
    useCase: 'Small regional study'
  },
  T031: {
    testId: 'T031',
    name: 'Region: Medium (15°×4°)',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: 0, maxLat: 15, minLon: -52, maxLon: -48 },
    maxDepth: 4,
    pointBudget: 4000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 1.8,
    expectedFps: 45,
    useCase: 'Medium regional study'
  },
  T032: {
    testId: 'T032',
    name: 'Region: Large (30°×7°)',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: 0, maxLat: 30, minLon: -54, maxLon: -47 },
    maxDepth: 3,
    pointBudget: 6000000,
    lodStrategy: 'distance_based',
    lodThreshold: 15,
    decimation: null,
    pointSize: 2,
    expectedFps: 35,
    useCase: 'Large continental scale'
  },
  // PERFORMANCE STRESS TESTS
  T040: {
    testId: 'T040',
    name: 'Stress: Max Everything',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: 20, maxLat: 40, minLon: -20, maxLon: 20 },
    maxDepth: 6,
    pointBudget: 15000000,
    lodStrategy: 'distance_based',
    lodThreshold: 1,
    decimation: null,
    pointSize: 0.8,
    expectedFps: 20,
    useCase: 'Maximum stress test'
  },
  T041: {
    testId: 'T041',
    name: 'Stress: Deep Tree',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -12.0, maxLat: 42.0, minLon: -32.0, maxLon: 32.0 },
    maxDepth: 8,
    pointBudget: 3000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.5,
    decimation: null,
    pointSize: 1,
    expectedFps: 25,
    useCase: 'Very deep octree'
  },
  T042: {
    testId: 'T042',
    name: 'Stress: Huge Budget',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -11.9, maxLat: 41.9, minLon: -31.9, maxLon: 31.9 },
    maxDepth: 4,
    pointBudget: 20000000,
    lodStrategy: 'distance_based',
    lodThreshold: 10,
    decimation: null,
    pointSize: 1,
    expectedFps: 15,
    useCase: 'Massive point budget'
  },
  T043: {
    testId: 'T043',
    name: 'Stress: Deep 8 + Massive Budget',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -12.1, maxLat: 42.1, minLon: -32.1, maxLon: 32.1 },
    maxDepth: 8,
    pointBudget: 20000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.5,
    decimation: null,
    pointSize: 1,
    expectedFps: 12,
    useCase: 'Deep octree with massive budget'
  },
  T044: {
    testId: 'T044',
    name: 'Stress: Deep 12 + Massive Budget',
    filename: 'CAL_LID_L1-Standard-V4-51.2023-06-30T16-44-43ZD.copc.laz',
    bounds: { minLat: -12.2, maxLat: 42.2, minLon: -32.2, maxLon: 32.2 },
    maxDepth: 12,
    pointBudget: 20000000,
    lodStrategy: 'distance_based',
    lodThreshold: 0.05,
    decimation: null,
    pointSize: 1,
    expectedFps: 10,
    useCase: 'Very deep octree with massive budget'
  }
}

interface TestConfigSelectorProps {
  onConfigSelect: (config: TestConfig) => void
  currentTestId?: string
}

export default function TestConfigSelector({ onConfigSelect, currentTestId }: TestConfigSelectorProps) {
  const [selectedConfig, setSelectedConfig] = useState<TestConfig | null>(
    currentTestId ? TEST_CONFIGS[currentTestId] : null
  )

  const handleSelectConfig = (testId: string) => {
    const config = TEST_CONFIGS[testId]
    setSelectedConfig(config)
    onConfigSelect(config)
    console.log(`[TestConfig] Applied ${testId}: ${config.name}`)
  }

  return (
    <div className="test-config-selector-inline">
      <div className="test-config-dropdown">
        <select
          value={selectedConfig?.testId || ''}
          onChange={(e) => e.target.value && handleSelectConfig(e.target.value)}
          className="control-select"
        >
          <option value="">Select a test configuration...</option>
          {Object.entries(TEST_CONFIGS).map(([id, config]) => (
            <option key={id} value={id}>
              {config.testId} - {config.name} ({config.expectedFps} FPS)
            </option>
          ))}
        </select>
      </div>

      {selectedConfig && (
        <div className="test-config-panel-inline">
          <div className="test-config-info">
            <div className="config-row">
              <span>Test ID:</span>
              <span>{selectedConfig.testId}</span>
            </div>
            <div className="config-row">
              <span>Max Depth:</span>
              <span>{selectedConfig.maxDepth}</span>
            </div>
            <div className="config-row">
              <span>Point Budget:</span>
              <span>{selectedConfig.pointBudget.toLocaleString()}</span>
            </div>
            <div className="config-row">
              <span>Point Size:</span>
              <span>{selectedConfig.pointSize}px</span>
            </div>
            <div className="config-row">
              <span>Expected FPS:</span>
              <span>{selectedConfig.expectedFps}</span>
            </div>
            <div className="config-row">
              <span>Bounds:</span>
              <span>Lat {selectedConfig.bounds.minLat}° to {selectedConfig.bounds.maxLat}°</span>
            </div>
            <div className="config-row">
              <span></span>
              <span>Lon {selectedConfig.bounds.minLon}° to {selectedConfig.bounds.maxLon}°</span>
            </div>
            <div className="config-use-case">
              💡 {selectedConfig.useCase}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
