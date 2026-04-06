import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { Sale } from '../types';
import { Card } from './ui/Base';
import { Loader2, Map as MapIcon } from 'lucide-react';
import { apiService } from '../services/apiService';
import { geocodeCities } from '../services/geminiService';

interface CityData {
  city: string;
  count: number;
  lat: number;
  lng: number;
}

const MapController: React.FC<{ cities: CityData[] }> = ({ cities }) => {
  const map = useMap();
  
  useEffect(() => {
    if (cities.length > 0) {
      const bounds = cities.map(c => [c.lat, c.lng] as [number, number]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [cities, map]);
  
  return null;
};

const SalesMap: React.FC = () => {
  const [cities, setCities] = useState<CityData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const sales = await apiService.getSales();
        
        const cityCounts: Record<string, number> = {};
        sales.forEach(sale => {
          if (sale.city) {
            cityCounts[sale.city] = (cityCounts[sale.city] || 0) + sale.quantity;
          }
        });

        const uniqueCities = Object.keys(cityCounts);
        if (uniqueCities.length === 0) {
          setLoading(false);
          return;
        }

        // Geocode cities using Gemini Service (with fallback)
        const geocoded = await geocodeCities(uniqueCities);

        const finalData: CityData[] = geocoded.map(g => ({
          ...g,
          count: cityCounts[g.city] || 0
        }));

        setCities(finalData);
      } catch (error) {
        console.error('Error fetching map data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Loader2 className="animate-spin h-8 w-8 text-indigo-600" />
      <p className="text-slate-500 font-medium">Térkép adatok betöltése és geokódolás...</p>
    </div>
  );

  if (cities.length === 0) return (
    <Card className="p-12 text-center text-slate-500 italic">
      Nincsenek város adatok az eladásokban.
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-100 rounded-lg">
          <MapIcon className="w-6 h-6 text-indigo-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Eladások Földrajzi Eloszlása</h2>
      </div>

      <Card className="h-[600px] relative z-0 overflow-hidden">
        <MapContainer 
          center={[47.1625, 19.5033]} // Center of Hungary
          zoom={7} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController cities={cities} />
          {cities.map((city, idx) => (
            <CircleMarker 
              key={idx}
              center={[city.lat, city.lng]}
              radius={Math.sqrt(city.count) * 5 + 5}
              fillColor="#6366f1"
              color="#4f46e5"
              weight={1}
              opacity={1}
              fillOpacity={0.6}
            >
              <Popup>
                <div className="text-center">
                  <p className="font-bold text-slate-900">{city.city}</p>
                  <p className="text-sm text-slate-600">{city.count} eladott darab</p>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </Card>
    </div>
  );
};

export default SalesMap;
