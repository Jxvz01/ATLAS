import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { useAtlasStore } from '../store/atlasStore';

interface MapViewProps {
  onLocationSelect?: (lat: number, lon: number) => void;
  interactiveSelection?: boolean;
}

export const MapView: React.FC<MapViewProps> = ({ onLocationSelect, interactiveSelection }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  const { 
    state, 
    selectedIncidentId, 
    setSelectedIncident, 
    evaluationResult 
  } = useAtlasStore();

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // OpenStreetMap dark styled vector/raster fallback style
    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: [
              'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors, © CARTO'
          }
        },
        layers: [
          {
            id: 'osm-tiles-layer',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [76.6394, 12.2958], // Mysuru, India
      zoom: 13,
      pitch: 25
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // Add Hazard overlay layers (Polygons)
      map.addSource('hazard-zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: (state?.hazards || []).map(h => ({
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [h.coordinates]
            },
            properties: {
              name: h.name,
              risk: h.risk_level
            }
          }))
        }
      });

      map.addLayer({
        id: 'hazard-zones-fill',
        type: 'fill',
        source: 'hazard-zones',
        paint: {
          'fill-color': '#EF4444',
          'fill-opacity': 0.22
        }
      });

      map.addLayer({
        id: 'hazard-zones-line',
        type: 'line',
        source: 'hazard-zones',
        paint: {
          'line-color': '#EF4444',
          'line-width': 2,
          'line-dasharray': [2, 2]
        }
      });

      // Add Routes Source & Layer
      map.addSource('active-routes', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'active-routes',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#0B0D10',
          'line-width': 6
        }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'active-routes',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#FF6438',
          'line-width': 4
        }
      });
    });

    if (interactiveSelection) {
      map.on('click', (e) => {
        if (onLocationSelect) {
          onLocationSelect(e.lngLat.lat, e.lngLat.lng);
        }
      });
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Hazard source if data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const hazSource = map.getSource('hazard-zones') as maplibregl.GeoJSONSource;
    if (hazSource && state?.hazards) {
      hazSource.setData({
        type: 'FeatureCollection',
        features: state.hazards.map(h => ({
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [h.coordinates]
          },
          properties: {
            name: h.name,
            risk: h.risk_level
          }
        }))
      });
    }
  }, [state?.hazards]);

  // Update Route source if evaluation or assignments change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const routeSource = map.getSource('active-routes') as maplibregl.GeoJSONSource;
    if (!routeSource) return;

    const routeFeatures: any[] = [];

    // Assignment routes
    (state?.assignments || []).forEach(asg => {
      if (asg.route_geometry && asg.route_geometry.length > 0 && asg.assignment_status !== 'Completed') {
        routeFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: asg.route_geometry
          },
          properties: {
            title: asg.explanation
          }
        });
      }
    });

    // Recommended route for evaluated incident
    if (evaluationResult?.route_geometry && evaluationResult.route_geometry.length > 0) {
      routeFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: evaluationResult.route_geometry
        },
        properties: {
          title: evaluationResult.explanation
        }
      });
    }

    routeSource.setData({
      type: 'FeatureCollection',
      features: routeFeatures
    });
  }, [state?.assignments, evaluationResult]);

  // Render markers for Incidents, Responders, Hospitals, and Blockages
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!state) return;

    // 1. Incidents
    state.incidents.forEach(inc => {
      if (inc.status === 'Resolved') return;

      const el = document.createElement('div');
      const isSelected = selectedIncidentId === inc.id;
      const isCritical = inc.priority_level === 'Critical';

      el.className = `flex items-center justify-center cursor-pointer transition-transform ${
        isSelected ? 'scale-125 z-20' : 'hover:scale-110'
      }`;
      
      const badgeColor = isCritical 
        ? 'bg-red-600 border-white text-white animate-pulse' 
        : inc.priority_level === 'High' 
        ? 'bg-orange-500 border-white text-white' 
        : 'bg-amber-400 border-obsidian text-obsidian';

      el.innerHTML = `
        <div class="h-6 w-6 rounded-full border-2 ${badgeColor} shadow-lg flex items-center justify-center font-bold text-[10px]">
          !
        </div>
      `;

      el.onclick = () => {
        setSelectedIncident(inc.id);
        map.flyTo({ center: [inc.longitude, inc.latitude], zoom: 14.5, duration: 800 });
      };

      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
        <div class="font-sans text-xs">
          <div class="font-bold text-signal">${inc.id} • ${inc.type}</div>
          <div class="text-coolwhite mt-1">${inc.description}</div>
          <div class="mt-2 flex gap-2 font-mono text-[10px]">
            <span class="bg-steel/50 px-1 py-0.5 rounded text-gray-300">Sev: ${inc.severity}/5</span>
            <span class="bg-steel/50 px-1 py-0.5 rounded text-gray-300">Pop: ${inc.affected_population}</span>
            <span class="bg-red-500/20 text-red-400 border border-red-500/40 px-1 py-0.5 rounded">${inc.priority_level}</span>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // 2. Responders
    state.resources.forEach(res => {
      const el = document.createElement('div');
      const isAvailable = res.status === 'Available';
      el.className = 'flex items-center justify-center cursor-pointer hover:scale-110';
      el.innerHTML = `
        <div class="px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold shadow ${
          isAvailable 
            ? 'bg-emerald-950/80 border-emerald-400 text-emerald-300' 
            : 'bg-blue-950/80 border-blue-400 text-blue-300'
        }">
          ${res.id}
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
        <div class="font-sans text-xs">
          <div class="font-bold text-emerald-400">${res.name} (${res.id})</div>
          <div class="text-gray-300">${res.type} • Capacity: ${res.capacity}</div>
          <div class="mt-1 font-mono text-[10px] text-gray-400">Status: <span class="text-coolwhite font-semibold">${res.status}</span></div>
          <div class="mt-1 text-[10px] text-gray-400">Capabilities: ${res.capabilities.join(', ')}</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([res.longitude, res.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // 3. Hospitals
    state.hospitals.forEach(hosp => {
      const el = document.createElement('div');
      el.className = 'flex items-center justify-center cursor-pointer hover:scale-110';
      el.innerHTML = `
        <div class="h-6 w-6 rounded bg-blue-600 border border-white text-white flex items-center justify-center font-bold text-xs shadow-md">
          H
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
        <div class="font-sans text-xs">
          <div class="font-bold text-blue-400">${hosp.name}</div>
          <div class="mt-1 text-gray-300">Status: <span class="font-semibold text-coolwhite">${hosp.operational_status}</span></div>
          <div class="mt-1 font-mono text-[10px] flex gap-2">
            <span>Beds: ${hosp.available_beds}/${hosp.total_beds}</span>
            <span>ICU: ${hosp.icu_capacity}</span>
          </div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([hosp.longitude, hosp.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

    // 4. Road Blockages
    state.road_blockages.forEach(blk => {
      if (blk.status !== 'Active') return;

      const el = document.createElement('div');
      el.className = 'flex items-center justify-center cursor-pointer';
      el.innerHTML = `
        <div class="h-6 w-6 rounded-full bg-amber-600 border border-black text-black flex items-center justify-center font-extrabold text-[11px] shadow-lg animate-bounce">
          ✕
        </div>
      `;

      const popup = new maplibregl.Popup({ offset: 12 }).setHTML(`
        <div class="font-sans text-xs">
          <div class="font-bold text-amber-500">BLOCKED: ${blk.road_id}</div>
          <div class="text-coolwhite mt-1">${blk.reason}</div>
          <div class="text-[10px] text-gray-400 font-mono mt-1">Status: Active Hazard Exclusion</div>
        </div>
      `);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([blk.longitude, blk.latitude])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });

  }, [state, selectedIncidentId]);

  return (
    <div className="relative w-full h-full min-h-[300px] bg-obsidian overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
      
      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 bg-graphite/90 border border-steel/60 rounded p-2 text-[10px] font-mono z-10 flex flex-wrap gap-3 shadow-md pointer-events-none select-none">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span>Critical Incident</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span>High Priority</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded bg-emerald-500" />
          <span>Available Unit</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded bg-blue-600" />
          <span>Hospital (H)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500 text-black flex items-center justify-center text-[7px] font-bold">✕</div>
          <span>Road Blockage</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-signal" />
          <span>Adaptive Route</span>
        </div>
      </div>
    </div>
  );
};
