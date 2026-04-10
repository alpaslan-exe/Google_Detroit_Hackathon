import { useEffect, useMemo, useRef, useState } from 'react'

const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
const LIGHT_LABELS = 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png'

export default function LeafletMap({ result, crimePoints }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const radiusRef = useRef(null)
  const heatLayerRef = useRef(null)

  const [showHeat, setShowHeat] = useState(false)

  // Normalize crime points into [lat, lng, weight] triples for L.heatLayer.
  // Accepts either [{lat, lng, weight?}, ...] or [[lat, lng, weight], ...].
  const heatData = useMemo(() => {
    if (!Array.isArray(crimePoints) || crimePoints.length === 0) return []
    if (Array.isArray(crimePoints[0])) return crimePoints
    return crimePoints.map((p) => [p.lat, p.lng, p.weight ?? 0.5])
  }, [crimePoints])

  // Create the map once
  useEffect(() => {
    const L = window.L
    if (!L || !mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([42.3314, -83.0458], 12)

    L.tileLayer(LIGHT_TILES, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)

    L.tileLayer(LIGHT_LABELS, {
      maxZoom: 19,
      pane: 'shadowPane',
    }).addTo(map)

    mapInstanceRef.current = map
    setTimeout(() => map.invalidateSize(), 0)

    const ro = new ResizeObserver(() => {
      if (mapInstanceRef.current) mapInstanceRef.current.invalidateSize()
    })
    ro.observe(mapRef.current)

    return () => {
      ro.disconnect()
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Crosshair marker + pulsing 500m radius on result change
  useEffect(() => {
    const L = window.L
    const map = mapInstanceRef.current
    if (!L || !map) return
    if (!result?.lat || !result?.lng) return

    if (markerRef.current) markerRef.current.remove()
    if (radiusRef.current) radiusRef.current.remove()

    const crosshairIcon = L.divIcon({
      className: '',
      html: '<div class="crosshair-marker"><div class="crosshair-dot"></div></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })

    markerRef.current = L.marker([result.lat, result.lng], { icon: crosshairIcon })
      .addTo(map)
      .bindPopup(
        `<div style="font-family:'DM Sans',system-ui,sans-serif;">
          <div style="color:#f59e0b;font-size:12px;letter-spacing:0.12em;margin-bottom:6px;">TARGET // LOCKED</div>
          <div style="color:#0f172a;font-size:15px;line-height:1.45;margin-bottom:8px;">${result.address}</div>
          <div style="color:#64748b;font-size:13px;">SCORE // ${result.score} // ${result.label}</div>
        </div>`
      )
      .openPopup()

    radiusRef.current = L.circle([result.lat, result.lng], {
      radius: 500,
      color: '#F59E0B',
      weight: 1,
      opacity: 0.6,
      fillColor: '#F59E0B',
      fillOpacity: 0.05,
      className: 'pulse-radius',
    }).addTo(map)

    map.flyTo([result.lat, result.lng], 15, { duration: 1.2 })
    setTimeout(() => map.invalidateSize(), 0)
  }, [result])

  // Heat layer — independent of result, responds to toggle + data
  useEffect(() => {
    const L = window.L
    const map = mapInstanceRef.current
    if (!L || !map) return

    if (heatLayerRef.current) {
      heatLayerRef.current.remove()
      heatLayerRef.current = null
    }

    if (!showHeat) return
    if (!L.heatLayer) {
      console.warn('leaflet.heat plugin not loaded')
      return
    }
    if (heatData.length === 0) return

    heatLayerRef.current = L.heatLayer(heatData, {
      radius: 22,
      blur: 18,
      maxZoom: 17,
      max: 1.0,
      gradient: {
        0.1: '#22C55E',
        0.3: '#84CC16',
        0.5: '#F59E0B',
        0.7: '#EF4444',
        1.0: '#B91C1C',
      },
    }).addTo(map)
  }, [showHeat, heatData])

  return (
    <>
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      <button
        type="button"
        className={`map-toggle ${showHeat ? 'active' : ''}`}
        onClick={() => setShowHeat((v) => !v)}
        aria-pressed={showHeat}
      >
        <span className={`map-toggle-led ${showHeat ? 'on' : ''}`} />
        CRIME HEATMAP
        <span className="map-toggle-state">[{showHeat ? 'ON' : 'OFF'}]</span>
      </button>
    </>
  )
}
