import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { 
  Layers, 
  Maximize2, 
  Minimize2, 
  Crosshair, 
  Plus, 
  Minus, 
  Check, 
  X,
  AlertCircle,
  Users,
  Building2,
  Home,
  CloudRain,
  Slash,
  Navigation
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';

interface SatelliteMapViewProps {
  onLocationSelect?: (lat: number, lon: number) => void;
  interactiveSelection?: boolean;
}

export const SatelliteMapView: React.FC<SatelliteMapViewProps> = ({ 
  onLocationSelect, 
  interactiveSelection 
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Base layers: 'satellite' | 'street' | 'terrain'
  const [baseLayer, setBaseLayer] = useState<'satellite' | 'street' | 'terrain'>('satellite');

  // Layer visibility toggles
  const [visibleLayers, setVisibleLayers] = useState({
    // Operational
    incidents: true,
    resources: true,
    hospitals: true,
    shelters: true,
    blockages: true,
    routes: true,
    // Intelligence
    floodZones: true,
    rainfall: true,
  });

  const { 
    state, 
    selectedIncidentId, 
    setSelectedIncident, 
    evaluationResult 
  } = useAtlasStore();

  // Basemap style URLs
  const getStyleForBase = (layerType: 'satellite' | 'street' | 'terrain') => {
    if (layerType === 'satellite') {
      return {
        version: 8 as const,
        sources: {
          'satellite-tiles': {
            type: 'raster' as const,
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '© Esri, Maxar, Earthstar Geographics'
          }
        },
        layers: [
          {
            id: 'satellite-tiles-layer',
            type: 'raster' as const,
            source: 'satellite-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      };
    } else if (layerType === 'street') {
      return {
        version: 8 as const,
        sources: {
          'osm-tiles': {
            type: 'raster' as const,
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles-layer',
            type: 'raster' as const,
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      };
    } else {
      // Clean Carto Light (Terrain/Positron)
      return {
        version: 8 as const,
        sources: {
          'carto-light': {
            type: 'raster' as const,
            tiles: [
              'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors, © CARTO'
          }
        },
        layers: [
          {
            id: 'carto-light-layer',
            type: 'raster' as const,
            source: 'carto-light',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      };
    }
  };

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: getStyleForBase('satellite') as any,
      center: [76.6394, 12.2958], // Mysuru, Karnataka, India
      zoom: 13,
      pitch: 0
    });

    map.on('mousemove', (e) => {
      setCursorCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('load', () => {
      // 1. Flood hazard zones (translucent blue with subtle dashed border)
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
        layout: {
          visibility: visibleLayers.floodZones ? 'visible' : 'none'
        },
        paint: {
          'fill-color': '#0284C7',
          'fill-opacity': 0.30
        }
      });

      map.addLayer({
        id: 'hazard-zones-line',
        type: 'line',
        source: 'hazard-zones',
        layout: {
          visibility: visibleLayers.floodZones ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#38BDF8',
          'line-width': 1.5,
          'line-dasharray': [3, 2]
        }
      });

      // 2. Active routes
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
          'line-cap': 'round',
          visibility: visibleLayers.routes ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#FFFFFF',
          'line-width': 5
        }
      });

      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'active-routes',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: visibleLayers.routes ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#F26A38',
          'line-width': 3
        }
      });

      // 3. Blocked roads line overlay
      map.addSource('blocked-roads-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: []
        }
      });

      map.addLayer({
        id: 'blocked-roads-line',
        type: 'line',
        source: 'blocked-roads-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
          visibility: visibleLayers.blockages ? 'visible' : 'none'
        },
        paint: {
          'line-color': '#DC3C3C',
          'line-width': 4,
          'line-dasharray': [2, 1]
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

  // Handle Base Layer switch
  const handleBaseLayerSwitch = (layer: 'satellite' | 'street' | 'terrain') => {
    setBaseLayer(layer);
    if (!mapRef.current) return;
    mapRef.current.setStyle(getStyleForBase(layer) as any);
  };

  // Re-add sources and layers when style changes or data updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setupSources = () => {
      if (!map.getSource('hazard-zones') && state?.hazards) {
        map.addSource('hazard-zones', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: state.hazards.map(h => ({
              type: 'Feature',
              geometry: { type: 'Polygon', coordinates: [h.coordinates] },
              properties: { name: h.name, risk: h.risk_level }
            }))
          }
        });
        map.addLayer({
          id: 'hazard-zones-fill',
          type: 'fill',
          source: 'hazard-zones',
          layout: { visibility: visibleLayers.floodZones ? 'visible' : 'none' },
          paint: { 'fill-color': '#0284C7', 'fill-opacity': 0.30 }
        });
        map.addLayer({
          id: 'hazard-zones-line',
          type: 'line',
          source: 'hazard-zones',
          layout: { visibility: visibleLayers.floodZones ? 'visible' : 'none' },
          paint: { 'line-color': '#38BDF8', 'line-width': 1.5, 'line-dasharray': [3, 2] }
        });
      }

      if (!map.getSource('active-routes')) {
        map.addSource('active-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'route-casing',
          type: 'line',
          source: 'active-routes',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: visibleLayers.routes ? 'visible' : 'none' },
          paint: { 'line-color': '#FFFFFF', 'line-width': 5 }
        });
        map.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'active-routes',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: visibleLayers.routes ? 'visible' : 'none' },
          paint: { 'line-color': '#F26A38', 'line-width': 3 }
        });
      }

      if (!map.getSource('blocked-roads-source')) {
        map.addSource('blocked-roads-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({
          id: 'blocked-roads-line',
          type: 'line',
          source: 'blocked-roads-source',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: visibleLayers.blockages ? 'visible' : 'none' },
          paint: { 'line-color': '#DC3C3C', 'line-width': 4, 'line-dasharray': [2, 1] }
        });
      }
    };

    if (map.isStyleLoaded()) {
      setupSources();
    } else {
      map.once('style.load', setupSources);
    }
  }, [baseLayer, state?.hazards]);

  // Update Routes source data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const routeSource = map.getSource('active-routes') as maplibregl.GeoJSONSource;
    if (!routeSource) return;

    const routeFeatures: any[] = [];

    (state?.assignments || []).forEach(asg => {
      if (asg.route_geometry && asg.route_geometry.length > 0 && asg.assignment_status !== 'Completed') {
        routeFeatures.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: asg.route_geometry
          },
          properties: { title: asg.explanation }
        });
      }
    });

    if (evaluationResult?.route_geometry && evaluationResult.route_geometry.length > 0) {
      routeFeatures.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: evaluationResult.route_geometry
        },
        properties: { title: evaluationResult.explanation }
      });
    }

    routeSource.setData({
      type: 'FeatureCollection',
      features: routeFeatures
    });
  }, [state?.assignments, evaluationResult, baseLayer]);

  // Update Blocked roads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const blkSource = map.getSource('blocked-roads-source') as maplibregl.GeoJSONSource;
    if (!blkSource) return;

    const blkFeatures = (state?.road_blockages || [])
      .filter(b => b.status === 'Active')
      .map(b => ({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [b.longitude - 0.003, b.latitude - 0.001],
            [b.longitude, b.latitude],
            [b.longitude + 0.003, b.latitude + 0.001]
          ]
        },
        properties: { reason: b.reason, road: b.road_id }
      }));

    blkSource.setData({
      type: 'FeatureCollection',
      features: blkFeatures as any
    });
  }, [state?.road_blockages, baseLayer]);

  // Sync layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    if (map.getLayer('hazard-zones-fill')) {
      map.setLayoutProperty('hazard-zones-fill', 'visibility', visibleLayers.floodZones ? 'visible' : 'none');
      map.setLayoutProperty('hazard-zones-line', 'visibility', visibleLayers.floodZones ? 'visible' : 'none');
    }
    if (map.getLayer('route-line')) {
      map.setLayoutProperty('route-line', 'visibility', visibleLayers.routes ? 'visible' : 'none');
      map.setLayoutProperty('route-casing', 'visibility', visibleLayers.routes ? 'visible' : 'none');
    }
    if (map.getLayer('blocked-roads-line')) {
      map.setLayoutProperty('blocked-roads-line', 'visibility', visibleLayers.blockages ? 'visible' : 'none');
    }
  }, [visibleLayers, baseLayer]);

  // Render Restrained, Minimal Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (!state) return;

    // 1. Incidents (Restrained marker design)
    if (visibleLayers.incidents) {
      state.incidents.forEach(inc => {
        if (inc.status === 'Resolved') return;

        const isSelected = selectedIncidentId === inc.id;
        const isCritical = inc.priority_level === 'Critical';
        const isHigh = inc.priority_level === 'High';
        const isModerate = inc.priority_level === 'Medium';

        const el = document.createElement('div');
        el.className = 'cursor-pointer select-none transition-transform hover:scale-110';

        // Clean circular badge with appropriate color
        const color = isCritical ? '#DC3C3C' : isHigh ? '#F26A38' : isModerate ? '#E6A23C' : '#718096';

        el.innerHTML = `
          <div style="background-color: ${color};" class="w-6 h-6 rounded-full border-2 border-white shadow flex items-center justify-center text-white font-bold text-[11px]">
            !
          </div>
        `;

        el.onclick = () => {
          setSelectedIncident(inc.id);
          map.flyTo({ center: [inc.longitude, inc.latitude], zoom: 14.5, duration: 600 });
        };

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div class="font-sans text-xs bg-white text-[#18212B] p-2 min-w-[180px]">
            <div class="flex items-center justify-between font-mono text-[10px] pb-1 border-b border-[#E5E9ED]">
              <span class="font-bold text-[#F26A38]">${inc.id}</span>
              <span class="font-bold uppercase px-1 py-0.2 rounded" style="background-color: ${color}20; color: ${color};">
                ${inc.priority_level}
              </span>
            </div>
            <div class="font-bold text-xs text-[#18212B] mt-1.5">${inc.type}</div>
            <div class="text-[#718096] text-[11px] mt-0.5 leading-snug">${inc.description}</div>
            <div class="mt-2 pt-1 border-t border-[#E5E9ED] flex justify-between font-mono text-[10px] text-[#718096]">
              <span>Affected: <b class="text-[#18212B]">${inc.affected_population}</b></span>
              <span>Severity: <b class="text-[#18212B]">${inc.severity}/5</b></span>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([inc.longitude, inc.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // 2. Response Units (Operational green)
    if (visibleLayers.resources) {
      state.resources.forEach(res => {
        const el = document.createElement('div');
        el.className = 'cursor-pointer hover:scale-110 transition-transform';
        
        el.innerHTML = `
          <div class="w-6 h-6 rounded-full bg-[#27966B] border-2 border-white text-white shadow flex items-center justify-center font-bold text-[10px]">
            R
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div class="font-sans text-xs bg-white text-[#18212B] p-2">
            <div class="font-bold text-[#27966B]">${res.name}</div>
            <div class="text-[#718096] text-[11px]">${res.type} • Capacity: ${res.capacity}</div>
            <div class="mt-1 font-mono text-[10px] text-[#718096]">
              Status: <span class="font-semibold text-[#18212B]">${res.status}</span>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([res.longitude, res.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // 3. Hospitals (Clean white with red cross)
    if (visibleLayers.hospitals) {
      state.hospitals.forEach(hosp => {
        const el = document.createElement('div');
        el.className = 'cursor-pointer hover:scale-110 transition-transform';
        
        el.innerHTML = `
          <div class="w-6 h-6 rounded-full bg-white border-2 border-[#DC3C3C] text-[#DC3C3C] shadow flex items-center justify-center font-bold text-xs">
            ✚
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div class="font-sans text-xs bg-white text-[#18212B] p-2">
            <div class="font-bold text-[#18212B]">${hosp.name}</div>
            <div class="text-[#718096] text-[11px] mt-0.5">Status: <span class="text-[#27966B] font-semibold">${hosp.operational_status}</span></div>
            <div class="mt-1.5 pt-1 border-t border-[#E5E9ED] font-mono text-[10px] text-[#718096] flex justify-between gap-3">
              <span>Beds: <b>${hosp.available_beds}/${hosp.total_beds}</b></span>
              <span>ICU: <b class="text-[#DC3C3C]">${hosp.icu_capacity}</b></span>
            </div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([hosp.longitude, hosp.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // 4. Shelters / Verified Safe Facilities (Shelter Marker)
    if (visibleLayers.shelters) {
      const shelters = [
        { id: 'SHL-01', name: 'Chamundi Vihar Indoor Stadium', lat: 12.3115, lon: 76.6620, cap: 450 },
        { id: 'SHL-02', name: 'Maharaja Ground Community Relief Center', lat: 12.3050, lon: 76.6430, cap: 300 }
      ];

      shelters.forEach(shl => {
        const el = document.createElement('div');
        el.className = 'cursor-pointer hover:scale-110 transition-transform';
        el.innerHTML = `
          <div class="w-6 h-6 rounded-full bg-[#4386C6] border-2 border-white text-white shadow flex items-center justify-center text-[11px]">
            ⌂
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div class="font-sans text-xs bg-white text-[#18212B] p-2">
            <div class="font-bold text-[#4386C6]">${shl.name}</div>
            <div class="text-[#718096] text-[11px] mt-0.5">Safe Evacuation Shelter</div>
            <div class="text-[10px] font-mono text-[#718096] mt-1">Shelter Capacity: <b>${shl.cap} persons</b></div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([shl.lon, shl.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

    // 5. Blocked Roads Marker
    if (visibleLayers.blockages) {
      state.road_blockages.forEach(blk => {
        if (blk.status !== 'Active') return;

        const el = document.createElement('div');
        el.className = 'cursor-pointer';
        el.innerHTML = `
          <div class="w-5 h-5 rounded-full bg-[#DC3C3C] border-2 border-white text-white shadow flex items-center justify-center font-bold text-[10px]">
            ✕
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(`
          <div class="font-sans text-xs bg-white text-[#18212B] p-2">
            <div class="font-bold text-[#DC3C3C]">${blk.road_id}</div>
            <div class="text-[#718096] text-[11px] mt-0.5">${blk.reason}</div>
          </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([blk.longitude, blk.latitude])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    }

  }, [state, selectedIncidentId, visibleLayers, baseLayer]);

  const handleRecenter = () => {
    mapRef.current?.flyTo({
      center: [76.6394, 12.2958],
      zoom: 13,
      duration: 600
    });
  };

  const handleZoomIn = () => mapRef.current?.zoomIn();
  const handleZoomOut = () => mapRef.current?.zoomOut();

  const toggleFullscreen = () => {
    if (!mapContainer.current) return;
    if (!document.fullscreenElement) {
      mapContainer.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const toggleLayer = (layer: keyof typeof visibleLayers) => {
    setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  };

  return (
    <div className="relative w-full h-full bg-[#F5F6F7] overflow-hidden select-none">
      {/* MapLibre Canvas Container */}
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />

      {/* TOP-RIGHT CONTROLS: LAYER SWITCHER, FULLSCREEN, RECENTER, ZOOM */}
      <div className="absolute top-4 right-4 z-10 flex flex-col items-end gap-2">
        {/* Unobtrusive Layer Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)}
            title="Layer Switcher"
            className="h-8 px-2.5 rounded bg-white/95 backdrop-blur-sm border border-[#E5E9ED] text-[#18212B] text-xs font-medium flex items-center gap-1.5 shadow-sm hover:border-[#F26A38] transition"
          >
            <Layers className="w-3.5 h-3.5 text-[#718096]" />
            <span className="capitalize">{baseLayer}</span>
          </button>

          {/* Clean, compact layer panel */}
          {isLayerMenuOpen && (
            <div className="absolute right-0 top-10 w-60 bg-white border border-[#E5E9ED] rounded-lg p-3 shadow-lg z-30 space-y-3 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-[#E5E9ED]">
                <span className="font-semibold text-[#18212B]">Map Layers</span>
                <button onClick={() => setIsLayerMenuOpen(false)}>
                  <X className="w-3.5 h-3.5 text-[#718096] hover:text-[#18212B]" />
                </button>
              </div>

              {/* Base Layers */}
              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-[#718096] mb-1.5">
                  Base Imagery
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(['satellite', 'street', 'terrain'] as const).map(b => (
                    <button
                      key={b}
                      onClick={() => handleBaseLayerSwitch(b)}
                      className={`px-2 py-1 rounded text-[11px] capitalize border transition ${
                        baseLayer === b 
                          ? 'border-[#F26A38] bg-[#F26A38]/10 text-[#F26A38] font-semibold' 
                          : 'border-[#E5E9ED] hover:bg-[#F5F6F7] text-[#18212B]'
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>

              {/* Operational Layers */}
              <div>
                <div className="text-[10px] font-mono uppercase font-bold text-[#718096] mb-1.5">
                  Operational Layers
                </div>
                <div className="space-y-1 text-[11px]">
                  {[
                    { key: 'incidents', label: 'Active Incidents' },
                    { key: 'resources', label: 'Response Units' },
                    { key: 'hospitals', label: 'Hospitals' },
                    { key: 'shelters', label: 'Verified Shelters' },
                    { key: 'blockages', label: 'Road Blockages' },
                    { key: 'routes', label: 'Response Routes' }
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => toggleLayer(item.key as any)}
                      className="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#F5F6F7] text-[#18212B]"
                    >
                      <span>{item.label}</span>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        visibleLayers[item.key as keyof typeof visibleLayers]
                          ? 'bg-[#F26A38] border-[#F26A38] text-white'
                          : 'border-[#E5E9ED]'
                      }`}>
                        {visibleLayers[item.key as keyof typeof visibleLayers] && <Check className="w-2.5 h-2.5" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Intelligence Layers */}
              <div className="pt-1.5 border-t border-[#E5E9ED]">
                <div className="text-[10px] font-mono uppercase font-bold text-[#718096] mb-1.5">
                  Intelligence Layers
                </div>
                <div className="space-y-1 text-[11px]">
                  {[
                    { key: 'floodZones', label: 'Flood / Hazard (SIMULATED)' },
                    { key: 'rainfall', label: 'Rainfall Inundation (SIMULATED)' }
                  ].map(item => (
                    <button
                      key={item.key}
                      onClick={() => toggleLayer(item.key as any)}
                      className="w-full flex items-center justify-between py-1 px-1.5 rounded hover:bg-[#F5F6F7] text-[#18212B]"
                    >
                      <span>{item.label}</span>
                      <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
                        visibleLayers[item.key as keyof typeof visibleLayers]
                          ? 'bg-[#F26A38] border-[#F26A38] text-white'
                          : 'border-[#E5E9ED]'
                      }`}>
                        {visibleLayers[item.key as keyof typeof visibleLayers] && <Check className="w-2.5 h-2.5" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Controls: Recenter, Fullscreen, Zoom */}
        <div className="bg-white/95 backdrop-blur-sm border border-[#E5E9ED] rounded shadow-sm flex flex-col divide-y divide-[#E5E9ED]">
          <button
            onClick={handleRecenter}
            title="Recenter Map"
            className="p-2 text-[#718096] hover:text-[#18212B] transition"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleFullscreen}
            title="Full Screen Toggle"
            className="p-2 text-[#718096] hover:text-[#18212B] transition"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            className="p-2 text-[#718096] hover:text-[#18212B] transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            className="p-2 text-[#718096] hover:text-[#18212B] transition"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* BOTTOM-LEFT COMPACT, RESTRAINED LEGEND */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/95 backdrop-blur-sm border border-[#E5E9ED] rounded-lg px-3 py-2 shadow-sm text-xs font-sans text-[#18212B] select-none">
        <div className="text-[10px] font-mono uppercase font-bold text-[#718096] pb-1 border-b border-[#E5E9ED] mb-1.5 flex items-center justify-between gap-3">
          <span>Map Elements</span>
          <span className="text-[9px] text-[#F26A38]">SIMULATION</span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#DC3C3C]" />
            <span>Incident</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#27966B]" />
            <span>Response Unit</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-[#DC3C3C] bg-white text-[#DC3C3C] text-[8px] flex items-center justify-center font-bold">✚</span>
            <span>Hospital</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4386C6]" />
            <span>Shelter</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-1.5 rounded-sm bg-[#0284C7]/60" />
            <span>Flood Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#DC3C3C]" />
            <span>Blocked Road</span>
          </div>
        </div>
      </div>

      {/* BOTTOM-RIGHT METADATA FOOTER */}
      <div className="absolute bottom-3 right-4 z-10 flex items-center gap-3 bg-white/95 backdrop-blur-sm border border-[#E5E9ED] px-3 py-1 rounded text-[10px] font-mono text-[#718096] shadow-sm">
        <span>Scale: ~2 km</span>
        <span>•</span>
        <span>
          {cursorCoords ? `${cursorCoords.lat.toFixed(4)}° N, ${cursorCoords.lng.toFixed(4)}° E` : '12.2958° N, 76.6394° E'}
        </span>
        <span>•</span>
        <span className="font-semibold text-[#F26A38]">PROTOTYPE SIMULATION</span>
      </div>
    </div>
  );
};
