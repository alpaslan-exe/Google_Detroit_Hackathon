import { useEffect, useRef } from "react";

export default function LeafletMap({ result }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    const L = window.L;
    const map = mapInstanceRef.current;
    if (!map || !result?.lat || !result?.lon) return;

    if (markerRef.current) markerRef.current.remove();
    markerRef.current = L.marker([result.lat, result.lon])
      .addTo(map)
      .bindPopup(`<b>${result.address}</b><br>Score: ${result.score}`)
      .openPopup();

    map.flyTo([result.lat, result.lon], 10); // zoom 14 = neighborhood level
  }, [result]);

  return (
    <div
      ref={mapRef}
      style={{ height: "100vh", width: "100vw", position: "fixed", top: 0, left: 0 }}
    />
  );
}