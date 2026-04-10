import { useEffect, useRef } from "react";

export default function LeafletMap({ result }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  // Create the map ONCE
  useEffect(() => {
    const L = window.L;
    if (!L || !mapRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        zoomControl: true,
      }).setView([42.3314, -83.0458], 11);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      mapInstanceRef.current = map;

      // If the map is rendered inside a card that may animate/resize, this helps
      setTimeout(() => map.invalidateSize(), 0);
    }

    // Cleanup on unmount (prevents “Map container is already initialized” in dev)
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update marker when result changes
  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;
    if (!result?.lat || !result?.lng) return;

    if (markerRef.current) markerRef.current.remove();

    markerRef.current = L.marker([result.lat, result.lng])
      .addTo(map)
      .bindPopup(`<b>${result.address}</b><br/>Score: ${result.score}`)
      .openPopup();

    map.flyTo([result.lat, result.lng], 14);

    // Ensure tiles render correctly after flyTo / conditional render
    setTimeout(() => map.invalidateSize(), 0);
  }, [result]);

  return <div ref={mapRef} style={{ height: "100%", width: "100%" }} />;
}