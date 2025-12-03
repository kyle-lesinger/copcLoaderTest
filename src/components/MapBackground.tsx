import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import './MapBackground.css'

interface MapBackgroundProps {
  center: [number, number] // [longitude, latitude]
  zoom?: number
}

export interface MapBackgroundHandle {
  setCenter: (lng: number, lat: number) => void
  setZoom: (zoom: number) => void
  setBearing: (bearing: number) => void
  setPitch: (pitch: number) => void
  jumpTo: (options: { center: [number, number]; zoom?: number; bearing?: number; pitch?: number }) => void
  getMap: () => maplibregl.Map | null
  addLayer: (layer: maplibregl.CustomLayerInterface) => void
  removeLayer: (layerId: string) => void
  hasLayer: (layerId: string) => boolean
}

const MapBackground = forwardRef<MapBackgroundHandle, MapBackgroundProps>(
  ({ center, zoom = 6 }, ref) => {
    const mapContainer = useRef<HTMLDivElement>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)

    useImperativeHandle(ref, () => ({
      setCenter: (lng: number, lat: number) => {
        if (mapRef.current) {
          mapRef.current.setCenter([lng, lat])
        }
      },
      setZoom: (zoom: number) => {
        if (mapRef.current) {
          mapRef.current.setZoom(zoom)
        }
      },
      setBearing: (bearing: number) => {
        if (mapRef.current) {
          mapRef.current.setBearing(bearing)
        }
      },
      setPitch: (pitch: number) => {
        if (mapRef.current) {
          mapRef.current.setPitch(pitch)
        }
      },
      jumpTo: (options: { center: [number, number]; zoom?: number; bearing?: number; pitch?: number }) => {
        if (mapRef.current) {
          // Use jumpTo for atomic updates - all changes happen in one render cycle
          mapRef.current.jumpTo({
            center: options.center,
            zoom: options.zoom,
            bearing: options.bearing,
            pitch: options.pitch
          })
        }
      },
      getMap: () => mapRef.current,
      addLayer: (layer: maplibregl.CustomLayerInterface) => {
        if (mapRef.current) {
          if (!mapRef.current.getLayer(layer.id)) {
            mapRef.current.addLayer(layer)
          }
        }
      },
      removeLayer: (layerId: string) => {
        if (mapRef.current && mapRef.current.getLayer(layerId)) {
          mapRef.current.removeLayer(layerId)
        }
      },
      hasLayer: (layerId: string) => {
        return mapRef.current ? !!mapRef.current.getLayer(layerId) : false
      }
    }))

    useEffect(() => {
      if (!mapContainer.current) return

      // Initialize map with free OpenStreetMap tiles and 3D support
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm': {
              type: 'raster',
              tiles: [
                'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
              ],
              tileSize: 256,
              attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
          },
          layers: [
            {
              id: 'osm',
              type: 'raster',
              source: 'osm',
              minzoom: 0,
              maxzoom: 19
            }
          ]
        },
        center: center,
        zoom: zoom,
        pitch: 60, // Initial pitch for 3D view
        bearing: 0,
        interactive: true, // Enable map interactions for 3D navigation
        antialias: true, // Enable antialiasing for smooth 3D rendering
        maxPitch: 85 // Allow maximum pitch for better 3D viewing
      })

      // Add navigation controls
      map.addControl(new maplibregl.NavigationControl(), 'top-right')

      // Add scale control
      map.addControl(new maplibregl.ScaleControl(), 'bottom-left')

      mapRef.current = map

      return () => {
        map.remove()
      }
    }, []) // Only initialize once on mount

    // Update center when prop changes
    useEffect(() => {
      if (!mapRef.current) return

      const updateCenter = () => {
        if (mapRef.current) {
          mapRef.current.setCenter([center[0], center[1]])
        }
      }

      if (mapRef.current.loaded()) {
        updateCenter()
      } else {
        mapRef.current.once('load', updateCenter)
      }
    }, [center])

    // Update zoom when prop changes
    useEffect(() => {
      if (!mapRef.current) return

      const updateZoom = () => {
        if (mapRef.current) {
          mapRef.current.setZoom(zoom)
        }
      }

      if (mapRef.current.loaded()) {
        updateZoom()
      } else {
        mapRef.current.once('load', updateZoom)
      }
    }, [zoom])

    return <div ref={mapContainer} className="map-background" />
  }
)

MapBackground.displayName = 'MapBackground'

export default MapBackground
