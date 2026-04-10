import { useEffect, useMemo, useRef, useState } from "react";

export default function LeafletMap({ result, crimePoints }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const heatLayerRef = useRef(null);

  const [showHeat, setShowHeat] = useState(false);

  // Normalize weights a bit (0..1-ish)
  const singlePointHeat = useMemo(() => {
    if (!result?.lat || !result?.lng) return null;

    // crude scaling: 0..150 crimes -> 0..1 weight (cap at 1)
    const w = Math.min((result.crime_count ?? 0) / 150, 1);

    return [[result.lat, result.lng, w]];
  }, [result]);

  const heatData = useMemo(() => {
    // Preferred: many points
    if (Array.isArray(crimePoints) && crimePoints.length > 0) {
      // expect: [{lat,lng,weight?}] or [[lat,lng,weight]]
      if (Array.isArray(crimePoints[0])) return crimePoints;
      return crimePoints.map((p) => [p.lat, p.lng, p.weight ?? 0.4]);
    }
    // Fallback: single weighted point based on crime_count
    return singlePointHeat ? singlePointHeat : [];
  }, [crimePoints, singlePointHeat]);

  // Create the map ONCE
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, { zoomControl: true }).setView(
        [42.3314, -83.0458],
        11
      );

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Keep marker / heat layer in sync with toggle + data
  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    // Clear existing layers
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }
    if (heatLayerRef.current) {
      heatLayerRef.current.remove();
      heatLayerRef.current = null;
    }

    if (!result?.lat || !result?.lng) return;

    if (showHeat) {
      // Requires leaflet-heat plugin: L.heatLayer
      if (!L.heatLayer) {
        console.warn("Leaflet.heat not loaded. Add leaflet-heat.js");
        return;
      }

      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 25,
        blur: 18,
        maxZoom: 17,
        // max controls intensity scaling; tweak based on your data
        max: 1.0,
      }).addTo(map);
    } else {
      markerRef.current = L.marker([result.lat, result.lng])
        .addTo(map)
        .bindPopup(
          `<b>${result.address}</b><br/>Crime count: ${result.crime_count ?? "—"}<br/>Score: ${
            result.score
          }`
        )
        .openPopup();
    }

    map.flyTo([result.lat, result.lng], 14);
    setTimeout(() => map.invalidateSize(), 0);
  }, [result, showHeat, heatData]);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* Toggle UI overlay */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          zIndex: 1000,
          background: "white",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          padding: "8px 10px",
          boxShadow: "0 10px 20px rgba(0,0,0,0.08)",
          fontSize: 13,
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={showHeat}
            onChange={(e) => setShowHeat(e.target.checked)}
          />
          Crime heatmap
        </label>
        {!crimePoints?.length && showHeat && (
          <div style={{ marginTop: 6, color: "rgba(0,0,0,0.6)" }}>
            Using {result?.crime_count ?? 0} as a single-point intensity.
          </div>
        )}
      </div>

      <div ref={mapRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}