import { ColorMode, Colormap, DataRange, ViewMode } from '../App'
import { getColormapName } from '../utils/colormaps'
import ColorBar from './ColorBar'
import TestConfigSelector, { TestConfig } from './TestConfigSelector'
import './ControlPanel.css'

interface ControlPanelProps {
  colorMode: ColorMode
  onColorModeChange: (mode: ColorMode) => void
  colormap: Colormap
  onColormapChange: (colormap: Colormap) => void
  pointSize: number
  onPointSizeChange: (size: number) => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  dataRange: DataRange
  // AOI controls
  isDrawingAOI: boolean
  onToggleDrawAOI: () => void
  onClearAOI: () => void
  onShowScatterPlot: () => void
  hasAOI: boolean
  hasAOIData: boolean
  aoiPointCount?: number
  // Ground mode controls
  isGroundModeActive: boolean
  onToggleGroundMode: () => void
  groundCameraPosition: { lat: number, lon: number } | null
  // Test config controls
  onTestConfigSelect: (config: TestConfig) => void
  currentTestId?: string
}

export default function ControlPanel({
  colorMode,
  onColorModeChange,
  colormap,
  onColormapChange,
  pointSize,
  onPointSizeChange,
  viewMode,
  onViewModeChange,
  dataRange,
  isDrawingAOI,
  onToggleDrawAOI,
  onClearAOI,
  onShowScatterPlot,
  hasAOI,
  hasAOIData,
  aoiPointCount,
  isGroundModeActive,
  onToggleGroundMode,
  groundCameraPosition,
  onTestConfigSelect,
  currentTestId
}: ControlPanelProps) {
  const colormaps: Colormap[] = ['viridis', 'plasma', 'turbo', 'coolwarm', 'jet', 'grayscale', 'calipso']

  return (
    <div className="panel control-panel">
      <h3>Display Settings</h3>

      <div className="control-group">
        <label className="control-label">Color Mode</label>
        <select
          value={colorMode}
          onChange={(e) => onColorModeChange(e.target.value as ColorMode)}
          className="control-select"
        >
          <option value="elevation">Elevation (Altitude)</option>
          <option value="intensity">Intensity (Backscatter 532nm)</option>
        </select>
      </div>

      {(
        <>
          <div className="control-group">
            <label className="control-label">Colormap</label>
            <select
              value={colormap}
              onChange={(e) => onColormapChange(e.target.value as Colormap)}
              className="control-select"
            >
              {colormaps.map(cm => (
                <option key={cm} value={cm}>{getColormapName(cm)}</option>
              ))}
            </select>
          </div>

          {/* ColorBar showing the current data range */}
          {(() => {
            // Determine which data range to display based on color mode
            let minValue = 0
            let maxValue = 1
            let label = ''

            if (colorMode === 'elevation') {
              if (dataRange.elevation) {
                minValue = dataRange.elevation[0]
                maxValue = dataRange.elevation[1]
                label = 'Altitude (km)'
              }
            } else if (colorMode === 'intensity') {
              if (dataRange.intensity) {
                minValue = dataRange.intensity[0]
                maxValue = dataRange.intensity[1]
                label = 'Backscatter Intensity (532nm)'
              }
            }

            // Only show colorbar if we have valid data
            const hasValidRange = maxValue > minValue

            return hasValidRange ? (
              <ColorBar
                colormap={colormap}
                minValue={minValue}
                maxValue={maxValue}
                label={label}
              />
            ) : null
          })()}
        </>
      )}

      <div className="control-group">
        <label className="control-label">
          Point Size: {pointSize.toFixed(1)}
        </label>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.5"
          value={pointSize}
          onChange={(e) => onPointSizeChange(parseFloat(e.target.value))}
          className="control-slider"
        />
      </div>

      {/* View mode removed - fixed to 2D only */}

      {/* Ground Mode */}
      {(
        <div className="control-group">
          <label className="control-label">Ground View</label>
          <button
            className={`control-button ${isGroundModeActive ? 'active' : ''}`}
            onClick={onToggleGroundMode}
          >
            {isGroundModeActive ? '✓ Ground Mode Active' : '🏔️ Activate Ground Mode'}
          </button>
          {isGroundModeActive && !groundCameraPosition && (
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
              Click on globe/map to place camera
            </p>
          )}
          {isGroundModeActive && groundCameraPosition && (
            <p className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
              Camera at {Math.abs(groundCameraPosition.lat).toFixed(4)}°{groundCameraPosition.lat < 0 ? 'S' : 'N'}, {Math.abs(groundCameraPosition.lon).toFixed(4)}°{groundCameraPosition.lon > 0 ? 'E' : 'W'}
            </p>
          )}
        </div>
      )}

      <div className="aoi-controls">
        <h4>Area of Interest:</h4>
        <div className="control-group">
          <button
            className={`control-button ${isDrawingAOI ? 'active' : ''}`}
            onClick={onToggleDrawAOI}
          >
            {isDrawingAOI ? 'Finish AOI' : 'Select AOI'}
          </button>
          {hasAOI && (
            <button
              className="control-button"
              onClick={onClearAOI}
            >
              Clear AOI
            </button>
          )}
        </div>
        {hasAOIData && aoiPointCount !== undefined && (
          <div className="aoi-info">
            <p><strong>Points in AOI:</strong> {aoiPointCount.toLocaleString()}</p>
            <button
              className="control-button primary"
              onClick={onShowScatterPlot}
            >
              Plot
            </button>
          </div>
        )}
        {isDrawingAOI && (
          <p className="text-muted" style={{ fontSize: '12px', marginTop: '8px' }}>
            Click on globe to add vertices
          </p>
        )}
      </div>

      {/* Test Configuration Selector */}
      <div className="test-config-section">
        <h4>Test Configurations:</h4>
        <TestConfigSelector
          onConfigSelect={onTestConfigSelect}
          currentTestId={currentTestId}
        />
      </div>
    </div>
  )
}
