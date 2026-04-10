import { useEffect, useRef } from 'react'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png'
const DARK_LABELS = 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png'

export default function LeafletMap({ result }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const radiusRef = useRef(null)

  useEffect(() => {
    const L = window.L
    if (!L || !mapRef.current || mapInstanceRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView([42.3314, -83.0458], 12)

    L.tileLayer(DARK_TILES, {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map)

    L.tileLayer(DARK_LABELS, {
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
        `<div style="font-family:'JetBrains Mono',monospace;">
          <div style="color:#F59E0B;font-size:9px;letter-spacing:0.12em;margin-bottom:4px;">TARGET // LOCKED</div>
          <div style="color:#E2E8F0;font-size:11px;margin-bottom:6px;">${result.address}</div>
          <div style="color:#94a3b8;font-size:10px;">SCORE // ${result.score} // ${result.label}</div>
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

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}
