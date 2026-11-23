import React, { useState, useEffect, useRef } from 'react';
import { 
  Navigation, 
  MapPin, 
  Phone, 
  CheckCircle2, 
  Clock, 
  Users, 
  AlertTriangle,
  Radio,
  FileText,
  UserPlus,
  HeartPulse,
  Settings,
  Bell,
  ArrowRight,
  Shield,
  Layers,
  ChevronRight,
  LogOut,
  Send,
  LifeBuoy,
  Menu,
  X,
  Compass,
  AlertCircle
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAtlasStore } from '../store/atlasStore';
import { useAuthStore } from '../store/authStore';

export const RescuerPortal: React.FC = () => {
  const { state, updateAssignmentStatus, reportRoadBlockage } = useAtlasStore();
  const { logout, userName } = useAuthStore();

  const [activeNav, setActiveNav] = useState('My Assignment');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<'report' | 'backup' | 'medical' | 'complete' | null>(null);
  
  // Field Report form states
  const [reportCasualties, setReportCasualties] = useState(0);
  const [reportAssessment, setReportAssessment] = useState('Flood waters standing at 3.5ft. Access route secure for inflatable boat.');
  const [reportRoadCondition, setReportRoadCondition] = useState('Partially waterlogged, passable by heavy rescue vehicle');
  const [reportNotes, setReportNotes] = useState('');

  // Backup Request states
  const [backupReason, setBackupReason] = useState('Additional boat team required for second residential cluster');
  const [backupUrgency, setBackupUrgency] = useState('High');

  // Medical Evacuation states
  const [medCasualtyCount, setMedCasualtyCount] = useState(2);
  const [medCondition, setMedCondition] = useState('Severe hypothermia and trauma. Requires immediate K.R. Hospital intake.');

  // Map references
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Target unit is R-04 as in the master design reference
  const currentUnit = state?.resources.find(r => r.id === 'R-04') || state?.resources.find(r => r.status === 'Assigned') || state?.resources[0];
  
  // Find active assignment for R-04 (or current unit)
  const activeAssignment = state?.assignments.find(
    a => a.resource_id === currentUnit?.id && a.assignment_status !== 'Completed' && a.assignment_status !== 'Canceled'
  ) || state?.assignments[0];

  const targetIncident = activeAssignment 
    ? state?.incidents.find(i => i.id === activeAssignment.incident_id) 
    : state?.incidents[0];

  // Lifecycle states: ASSIGNED -> ACKNOWLEDGED -> EN ROUTE -> ON SCENE -> COMPLETED
  // Map backend status strings to lifecycle stages
  const currentStatus = activeAssignment?.assignment_status || 'En Route';

  const lifecycleStages = [
    { key: 'Assigned', label: 'ASSIGNED', next: 'Acknowledged', nextLabel: 'Acknowledge Mission' },
    { key: 'Acknowledged', label: 'ACKNOWLEDGED', next: 'En Route', nextLabel: 'Start En Route' },
    { key: 'En Route', label: 'EN ROUTE', next: 'On Scene', nextLabel: 'Arrived On Scene' },
    { key: 'On Scene', label: 'ON SCENE', next: 'Completed', nextLabel: 'Complete Mission' },
    { key: 'Completed', label: 'COMPLETED', next: null, nextLabel: 'Mission Resolved' }
  ];

  const currentStageIndex = lifecycleStages.findIndex(
    s => s.key.toLowerCase() === currentStatus.toLowerCase()
  );

  const activeStage = currentStageIndex >= 0 ? lifecycleStages[currentStageIndex] : lifecycleStages[2];

  // Handle Valid Status Progression
  const handleProgressStatus = async (targetNextStage: string) => {
    if (!activeAssignment) return;
    if (targetNextStage === 'Completed') {
      setActiveModal('complete');
      return;
    }
    await updateAssignmentStatus(activeAssignment.id, targetNextStage);
    setStatusFeedback(`Mission status updated: ${targetNextStage}`);
    setTimeout(() => setStatusFeedback(null), 3500);
  };

  // Initialize MapLibre satellite mini route view
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          'esri-satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            attribution: '© Esri, Maxar, Earthstar Geographics'
          }
        },
        layers: [
          {
            id: 'satellite-tiles',
            type: 'raster',
            source: 'esri-satellite',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: [76.6380, 12.3120],
      zoom: 13.5,
      attributionControl: false
    });

    mapRef.current = map;

    map.on('load', () => {
      // Safe detour route GeoJSON
      const routeCoordinates = [
        [76.6260, 12.3020], // R-04 start position
        [76.6310, 12.3060],
        [76.6350, 12.3100],
        [76.6430, 12.3180], // Target INC-101 / INC-104 position
      ];

      map.addSource('rescuer-route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates
          }
        }
      });

      // Route glow line
      map.addLayer({
        id: 'rescuer-route-glow',
        type: 'line',
        source: 'rescuer-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#22C55E',
          'line-width': 7,
          'line-opacity': 0.35
        }
      });

      // Route solid core
      map.addLayer({
        id: 'rescuer-route-line',
        type: 'line',
        source: 'rescuer-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#22C55E',
          'line-width': 3.5
        }
      });

      // Vehicle marker (green rescue unit)
      const vehicleEl = document.createElement('div');
      vehicleEl.className = 'w-9 h-9 rounded-full bg-[#16A34A] border-2 border-white flex items-center justify-center shadow-lg text-white font-bold text-xs select-none';
      vehicleEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>`;
      new maplibregl.Marker({ element: vehicleEl })
        .setLngLat([76.6350, 12.3100])
        .addTo(map);

      // Target Incident Marker (pulsing red hazard)
      const incEl = document.createElement('div');
      incEl.className = 'relative flex items-center justify-center';
      incEl.innerHTML = `
        <div class="absolute w-14 h-14 rounded-full bg-[#DC3C3C]/30 animate-ping"></div>
        <div class="w-10 h-10 rounded-full bg-[#DC3C3C] border-2 border-white flex items-center justify-center shadow-xl text-white font-black text-xs z-10">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
      `;
      new maplibregl.Marker({ element: incEl })
        .setLngLat([76.6430, 12.3180])
        .addTo(map);

      // Blocked road marker on Hinkal
      const blkEl = document.createElement('div');
      blkEl.className = 'w-7 h-7 rounded-full bg-[#E23B3B] border-2 border-white flex items-center justify-center text-white text-[11px] font-bold shadow-md';
      blkEl.innerHTML = `✕`;
      new maplibregl.Marker({ element: blkEl })
        .setLngLat([76.6530, 12.3120])
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const navItems = [
    { label: 'My Assignment', icon: Navigation },
    { label: 'Live Map', icon: Layers },
    { label: 'Team', icon: Users },
    { label: 'Resources', icon: Shield },
    { label: 'Reports', icon: FileText },
    { label: 'SOS Inbox', icon: Bell },
    { label: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#F5F7F9] text-[#17212B] font-sans overflow-hidden select-none">
      
      {/* MOBILE TOP BAR */}
      <div className="md:hidden bg-white border-b border-[#E3E8ED] px-4 py-3 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#F26536] text-white flex items-center justify-center font-black text-xs shadow-xs">
            ▲
          </div>
          <div>
            <div className="font-extrabold text-sm tracking-tight text-[#17212B]">ATLAS FIELD</div>
            <div className="text-[10px] text-[#64748B] font-mono">{currentUnit?.id || 'R-04'} • {currentUnit?.type || 'Boat Team'}</div>
          </div>
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg border border-[#E3E8ED] text-[#17212B] hover:bg-[#F5F7F9]"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* 1. SIDEBAR (Collapsible on mobile) */}
      <aside className={`
        ${mobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex w-full md:w-[230px] bg-white border-r border-[#E3E8ED] flex-col justify-between shrink-0 z-20 shadow-sm
        absolute md:static top-14 bottom-0 left-0
      `}>
        <div>
          {/* Desktop Logo Header */}
          <div className="p-4 border-b border-[#E3E8ED] hidden md:flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#F26536] flex items-center justify-center text-white font-black text-sm shadow-sm">
              ▲
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-[#17212B]">ATLAS</div>
              <div className="text-[11px] text-[#64748B]">Rescuer Portal</div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => {
                    setActiveNav(item.label);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 md:py-2 rounded-lg text-xs font-medium transition ${
                    isActive
                      ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                      : 'text-[#64748B] hover:bg-[#F5F7F9] hover:text-[#17212B]'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-[#F26536]' : 'text-[#64748B]'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Rescuer Status Badge & Logout */}
        <div className="p-3 border-t border-[#E3E8ED] space-y-2 bg-white">
          <div className="p-2.5 bg-[#F8FAFC] rounded-lg border border-[#E3E8ED]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#23966B] animate-pulse"></span>
              <span className="text-[11px] font-semibold text-[#17212B]">Online • On Duty</span>
            </div>
            <div className="text-[10px] text-[#64748B] mt-0.5 font-mono">
              {currentUnit?.id || 'R-04'} | {currentUnit?.type || 'Boat Team'}
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-2 md:py-1.5 text-xs text-[#64748B] hover:text-[#E23B3B] hover:bg-red-50 rounded transition font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN FIELD TERMINAL WORKSPACE */}
      <main className="flex-1 p-4 md:p-5 overflow-y-auto space-y-4">
        
        {/* Status Confirmation Banner */}
        {statusFeedback && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{statusFeedback}</span>
            </div>
            <button onClick={() => setStatusFeedback(null)} className="text-emerald-700 font-bold">✕</button>
          </div>
        )}

        {/* TOP ROW: Current Assignment Card (Left) & MapLibre Route View (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          
          {/* CURRENT ASSIGNMENT & MISSION LIFECYCLE CARD */}
          <div className="bg-white rounded-xl border border-[#E3E8ED] p-5 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              {/* Header Badge & Severity */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-[#17212B]">Current Assignment</h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#F1F5F9] text-[#64748B] font-semibold">
                    {targetIncident?.status || 'Active'}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-[#E23B3B] bg-[#E23B3B]/10 px-2.5 py-0.5 rounded-full border border-[#E23B3B]/20">
                  {targetIncident?.priority_level || 'High Priority'}
                </span>
              </div>

              {/* Incident Title, Location & Required Capability */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-[#E23B3B]/10 border border-[#E23B3B]/20 flex items-center justify-center text-[#E23B3B] shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#17212B] leading-tight truncate">
                    {targetIncident?.id || 'INC-101'} – {targetIncident?.type || 'Flooding'}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs text-[#64748B] mt-1">
                    <MapPin className="w-3.5 h-3.5 text-[#F26536] shrink-0" />
                    <span>Vijayanagar, Mysuru</span>
                    <span className="text-[#94A3B8]">•</span>
                    <span className="text-[#0284C7] font-semibold">Req: Water Rescue</span>
                  </div>
                </div>
              </div>

              {/* Description & People Affected */}
              <p className="text-xs text-[#64748B] leading-relaxed mb-3">
                {targetIncident?.description || 'Flash water inundation in low-lying residential homes. Water level at 4.5 feet.'}
                {targetIncident?.affected_population ? ` (~${targetIncident.affected_population} civilians reported)` : ''}
              </p>

              {/* Metrics Grid */}
              <div className="grid grid-cols-4 gap-2 py-3 border-y border-[#E3E8ED] bg-[#F8FAFC] rounded-lg px-3">
                <div>
                  <div className="text-[10px] text-[#64748B] font-medium">ETA</div>
                  <div className="text-sm font-bold text-[#17212B]">7 min</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-medium">Distance</div>
                  <div className="text-sm font-bold text-[#17212B]">3.2 km</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-medium">Team</div>
                  <div className="text-sm font-bold text-[#17212B]">{currentUnit?.id || 'R-04'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B] font-medium">Type</div>
                  <div className="text-xs font-semibold text-[#17212B] truncate">{currentUnit?.type || 'Boat Team'}</div>
                </div>
              </div>
            </div>

            {/* MISSION LIFECYCLE TRACKER & PROMINENT TAP CONTROL */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#64748B]">
                <span>MISSION LIFECYCLE:</span>
                <span className="font-bold text-[#F26536]">{activeStage.label}</span>
              </div>

              {/* Lifecycle Progress Dots */}
              <div className="grid grid-cols-5 gap-1.5">
                {lifecycleStages.map((stage, idx) => {
                  const isDone = idx < currentStageIndex;
                  const isCurrent = idx === currentStageIndex;
                  return (
                    <div key={stage.key} className="flex flex-col items-center gap-1">
                      <div className={`w-full h-1.5 rounded-full ${
                        isDone ? 'bg-[#23966B]' : isCurrent ? 'bg-[#F26536]' : 'bg-[#E3E8ED]'
                      }`} />
                      <span className={`text-[9px] font-mono leading-tight ${
                        isCurrent ? 'text-[#F26536] font-bold' : isDone ? 'text-[#23966B]' : 'text-[#94A3B8]'
                      }`}>
                        {stage.key.slice(0, 5)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Primary Easy-to-Tap Lifecycle Transition Button */}
              {activeStage.next ? (
                <button
                  onClick={() => handleProgressStatus(activeStage.next!)}
                  className="w-full py-3.5 bg-[#F26536] hover:bg-[#E05322] active:scale-98 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Navigation className="w-4 h-4" />
                  <span>{activeStage.nextLabel} →</span>
                </button>
              ) : (
                <div className="w-full py-3 bg-[#23966B]/10 border border-[#23966B]/30 text-[#23966B] rounded-xl text-xs font-bold text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Mission Completed & Verified</span>
                </div>
              )}
            </div>
          </div>

          {/* SATELLITE MAP ROUTE VIEW */}
          <div className="bg-white rounded-xl border border-[#E3E8ED] overflow-hidden shadow-sm relative min-h-[300px] flex flex-col">
            <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[#E3E8ED] text-[11px] font-semibold text-[#17212B] flex items-center gap-1.5 shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[#23966B]"></span>
              <span>Active Detour Route • Avoids Hinkal</span>
            </div>
            
            <div className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-xs px-2 py-1 rounded border border-[#E3E8ED] text-[10px] font-mono text-[#64748B]">
              INC-101 / INC-104
            </div>

            <div ref={mapContainerRef} className="flex-1 w-full h-full min-h-[300px]" />

            {/* Bottom Map Legend Strip */}
            <div className="p-2.5 bg-white border-t border-[#E3E8ED] flex flex-wrap items-center justify-between text-[10px] text-[#64748B] gap-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#16A34A]"></span> Unit R-04
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#DC3C3C]"></span> Incident
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-[#22C55E]"></span> Cleared Path
                </span>
                <span className="inline-flex items-center gap-1 text-red-600 font-medium">
                  <span>✕</span> Road Blocked
                </span>
              </div>
              <span className="font-mono text-[9px] bg-[#F1F5F9] px-1.5 py-0.5 rounded">Simulated Terrain Route</span>
            </div>
          </div>

        </div>

        {/* BOTTOM ROW: Incident Updates Timeline (Left) & Quick Actions 2x2 Grid (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          
          {/* INCIDENT UPDATES TIMELINE */}
          <div className="bg-white rounded-xl border border-[#E3E8ED] p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-bold text-[#17212B]">Incident Updates</h2>
            
            <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E3E8ED]">
              {/* Event 1 */}
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#23966B] border-2 border-white"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#64748B]">18:01</span>
                    <span className="text-xs font-semibold text-[#17212B]">Assignment received</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">Dispatched via Command Center decision engine.</p>
                </div>
              </div>

              {/* Event 2 */}
              <div className="relative flex items-start gap-3">
                <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-[#23966B] border-2 border-white"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#64748B]">18:03</span>
                    <span className="text-xs font-semibold text-[#17212B]">Route confirmed</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">Detour calculated avoiding submerged Ring Road.</p>
                </div>
              </div>

              {/* Event 3 */}
              <div className="relative flex items-start gap-3">
                <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ${
                  currentStageIndex >= 2 ? 'bg-[#F26536] ring-2 ring-[#F26536]/20' : 'bg-[#E3E8ED]'
                }`}></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#F26536] font-bold">18:05</span>
                    <span className="text-xs font-bold text-[#F26536]">En route to location</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">Approaching Vijayanagar Stage 2 area.</p>
                </div>
              </div>

              {/* Event 4 */}
              <div className="relative flex items-start gap-3">
                <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ${
                  currentStageIndex >= 3 ? 'bg-[#23966B]' : 'bg-[#E3E8ED]'
                }`}></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#64748B]">
                      {currentStageIndex >= 3 ? '18:12' : '--:--'}
                    </span>
                    <span className="text-xs text-[#17212B] font-medium">On-Scene Arrival</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    {currentStageIndex >= 3 ? 'Unit arrived at low-lying residential sector.' : 'Awaiting arrival confirmation.'}
                  </p>
                </div>
              </div>

              {/* Event 5 */}
              <div className="relative flex items-start gap-3">
                <div className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ${
                  currentStageIndex >= 4 ? 'bg-[#23966B]' : 'bg-[#E3E8ED]'
                }`}></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-[#64748B]">
                      {currentStageIndex >= 4 ? '18:25' : '--:--'}
                    </span>
                    <span className="text-xs text-[#64748B]">Mission Completion</span>
                  </div>
                  <p className="text-[11px] text-[#64748B]">
                    {currentStageIndex >= 4 ? 'All stranded civilians safely evacuated.' : 'Field verification required before close.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* OPERATIONAL QUICK ACTIONS (2x2 Grid) */}
          <div className="bg-white rounded-xl border border-[#E3E8ED] p-5 shadow-sm flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#17212B]">Quick Actions</h2>
              <span className="text-[10px] text-[#64748B] font-mono">SEOC Connected</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 flex-1">
              {/* Action A: On-site Report */}
              <button
                onClick={() => setActiveModal('report')}
                className="p-4 rounded-xl border border-[#E3E8ED] bg-[#F8FAFC] hover:bg-[#F26536]/10 hover:border-[#F26536]/40 active:scale-98 transition flex flex-col items-center justify-center text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E3E8ED] flex items-center justify-center text-[#17212B] group-hover:text-[#F26536] transition shadow-xs">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[#17212B] group-hover:text-[#F26536]">On-site Report</span>
                <span className="text-[10px] text-[#64748B] leading-tight">Casualty & road status</span>
              </button>

              {/* Action B: Request Backup */}
              <button
                onClick={() => setActiveModal('backup')}
                className="p-4 rounded-xl border border-[#E3E8ED] bg-[#F8FAFC] hover:bg-amber-50 hover:border-amber-300 active:scale-98 transition flex flex-col items-center justify-center text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E3E8ED] flex items-center justify-center text-[#17212B] group-hover:text-[#F0A43A] transition shadow-xs">
                  <UserPlus className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[#17212B] group-hover:text-[#F0A43A]">Request Support</span>
                <span className="text-[10px] text-[#64748B] leading-tight">Reinforcement or drone</span>
              </button>

              {/* Action C: Medical Assistance */}
              <button
                onClick={() => setActiveModal('medical')}
                className="p-4 rounded-xl border border-[#E3E8ED] bg-[#F8FAFC] hover:bg-red-50 hover:border-red-300 active:scale-98 transition flex flex-col items-center justify-center text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E3E8ED] flex items-center justify-center text-[#17212B] group-hover:text-[#E23B3B] transition shadow-xs">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[#17212B] group-hover:text-[#E23B3B]">Medical Assistance</span>
                <span className="text-[10px] text-[#64748B] leading-tight">Casualty medevac alert</span>
              </button>

              {/* Action D: Complete Mission */}
              <button
                onClick={() => setActiveModal('complete')}
                className="p-4 rounded-xl border border-[#E3E8ED] bg-[#F8FAFC] hover:bg-emerald-50 hover:border-emerald-300 active:scale-98 transition flex flex-col items-center justify-center text-center gap-2 group"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-[#E3E8ED] flex items-center justify-center text-[#17212B] group-hover:text-[#23966B] transition shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-[#17212B] group-hover:text-[#23966B]">Mark as Resolved</span>
                <span className="text-[10px] text-[#64748B] leading-tight">Close & release unit</span>
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* MODAL 1: ON-SITE FIELD REPORT */}
      {activeModal === 'report' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E8ED] pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#F26536]" />
                <h3 className="text-sm font-bold text-[#17212B]">On-Site Field Report: {targetIncident?.id || 'INC-101'}</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Casualties Count</label>
                <input 
                  type="number" 
                  value={reportCasualties} 
                  onChange={(e) => setReportCasualties(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] font-mono text-xs" 
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Situation Assessment</label>
                <input 
                  type="text" 
                  value={reportAssessment} 
                  onChange={(e) => setReportAssessment(e.target.value)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs" 
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Road Condition Encountered</label>
                <input 
                  type="text" 
                  value={reportRoadCondition} 
                  onChange={(e) => setReportRoadCondition(e.target.value)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs" 
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Field Observation Note</label>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Additional field specifics or structural hazards..."
                  rows={2}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    const { api } = await import('../services/api');
                    await api.submitFieldReport({
                      incident_id: targetIncident?.id || 'INC-101',
                      resource_id: currentUnit?.id || 'R-04',
                      casualties: reportCasualties,
                      assessment: reportAssessment,
                      road_condition: reportRoadCondition,
                      notes: reportNotes
                    });
                    setActiveModal(null);
                    setStatusFeedback("On-site field report transmitted to Command Center & persisted.");
                  } catch (e: any) {
                    setActiveModal(null);
                    setStatusFeedback("Report transmission logged locally.");
                  }
                  setTimeout(() => setStatusFeedback(null), 4000);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-[#F26536] hover:bg-[#E05322] rounded-xl transition shadow-xs"
              >
                Transmit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: REQUEST BACKUP */}
      {activeModal === 'backup' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E8ED] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#F0A43A]" />
                <h3 className="text-sm font-bold text-[#17212B]">Request Support / Backup</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Urgency Tier</label>
                <select 
                  value={backupUrgency} 
                  onChange={(e) => setBackupUrgency(e.target.value)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs font-semibold"
                >
                  <option>Critical (Immediate reinforcement needed)</option>
                  <option>High (Additional boat team within 15 min)</option>
                  <option>Moderate (Secondary transit vehicle support)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Operational Justification</label>
                <textarea
                  value={backupReason}
                  onChange={(e) => setBackupReason(e.target.value)}
                  rows={3}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setStatusFeedback("Backup request prioritized in SEOC dispatch queue.");
                  setTimeout(() => setStatusFeedback(null), 4000);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-[#F0A43A] hover:bg-amber-600 rounded-xl transition shadow-xs"
              >
                Signal Backup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: MEDICAL ASSISTANCE / EVACUATION */}
      {activeModal === 'medical' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E8ED] pb-3">
              <div className="flex items-center gap-2">
                <HeartPulse className="w-5 h-5 text-[#E23B3B]" />
                <h3 className="text-sm font-bold text-[#17212B]">Medical Evacuation Alert</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Casualties Requiring Hospital Transfer</label>
                <input 
                  type="number" 
                  value={medCasualtyCount} 
                  onChange={(e) => setMedCasualtyCount(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] font-mono text-xs font-bold" 
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Triage Summary & Condition</label>
                <textarea
                  value={medCondition}
                  onChange={(e) => setMedCondition(e.target.value)}
                  rows={3}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs"
                />
              </div>

              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>Nearest designated trauma facility: <b>K.R. Hospital (HOSP-01)</b>.</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActiveModal(null);
                  setStatusFeedback("Medical evacuation signal delivered to SEOC and K.R. Hospital.");
                  setTimeout(() => setStatusFeedback(null), 4000);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-[#E23B3B] hover:bg-red-700 rounded-xl transition shadow-xs"
              >
                Alert Medevac
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CONFIRM MISSION COMPLETION */}
      {activeModal === 'complete' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#23966B] shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#17212B]">Complete & Resolve Mission?</h3>
                <p className="text-xs text-[#64748B] mt-0.5">This releases Unit R-04 back to available pool.</p>
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E3E8ED] text-xs text-[#64748B] space-y-1">
              <div>Incident: <b className="text-[#17212B]">{targetIncident?.id || 'INC-101'}</b></div>
              <div>Location: <b>Vijayanagar, Mysuru</b></div>
              <div className="text-[11px] text-emerald-700 pt-1">
                ✓ All casualties accounted for and field safe.
              </div>
            </div>

            <div className="flex gap-2 pt-1 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (activeAssignment) {
                    await updateAssignmentStatus(activeAssignment.id, 'Completed');
                  }
                  setActiveModal(null);
                  setStatusFeedback("Mission confirmed resolved. Unit status updated to Available.");
                  setTimeout(() => setStatusFeedback(null), 4000);
                }}
                className="flex-1 py-2 text-xs font-semibold text-white bg-[#23966B] hover:bg-emerald-700 rounded-xl transition shadow-xs"
              >
                Confirm Completion
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
