import { useEffect, useRef, useState } from 'react';
import { classNames } from '@/lib/format';
import { MapPinOff } from 'lucide-react';

interface GoogleMapLiveProps {
  latitude: number;
  longitude: number;
  accuracy?: number;
  className?: string;
  zoom?: number;
}

export function GoogleMapLive({ latitude, longitude, accuracy, className, zoom = 15 }: GoogleMapLiveProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      setError('Google Maps API key is not configured.');
      return;
    }
    
    const initMap = () => {
      if (!mapRef.current || !(window as any).google) return;
      const center = { lat: latitude, lng: longitude };
      const map = new (window as any).google.maps.Map(mapRef.current, {
        center,
        zoom,
        disableDefaultUI: true,
        zoomControl: true,
      });
      
      new (window as any).google.maps.Marker({
        position: center,
        map,
        title: 'Current Location',
      });
      
      if (accuracy) {
        new (window as any).google.maps.Circle({
          strokeColor: '#3b82f6',
          strokeOpacity: 0.8,
          strokeWeight: 2,
          fillColor: '#3b82f6',
          fillOpacity: 0.15,
          map,
          center,
          radius: accuracy,
        });
      }
    };

    if ((window as any).google && (window as any).google.maps) {
      initMap();
    } else {
      const existingScript = document.getElementById('google-maps-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
        script.async = true;
        script.defer = true;
        script.onload = initMap;
        script.onerror = () => setError('Failed to load Google Maps script.');
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', initMap);
      }
    }
  }, [latitude, longitude, accuracy, zoom]);

  if (error) {
    return (
      <div className={classNames("flex flex-col items-center justify-center bg-slate-100 rounded-lg text-slate-500", className)}>
        <MapPinOff className="h-8 w-8 mb-2 text-slate-400" />
        <span className="text-sm font-medium">Map Unavailable</span>
        <span className="text-xs text-slate-400 mt-1 max-w-[200px] text-center">{error}</span>
      </div>
    );
  }

  return <div ref={mapRef} className={classNames("bg-slate-100 rounded-lg overflow-hidden", className)} />;
}
