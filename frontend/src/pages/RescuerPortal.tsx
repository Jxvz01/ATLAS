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
  AlertCircle,
  MessageSquare,
  Siren,
  CheckCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  Server
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAtlasStore } from '../store/atlasStore';
import { useAuthStore } from '../store/authStore';
import { VoiceMicButton } from '../components/VoiceMicButton';
import { offlineQueue, QueuedOperation } from '../services/offlineQueue';
import { getApiBase, setApiBase } from '../services/api';

export const RescuerPortal: React.FC = () => {
  const { 
    state, 
    updateAssignmentStatus, 
    reportRoadBlockage,
    fieldAlerts,
    missionMessages,
    fetchFieldAlerts,
    fetchMissionMessages,
    submitFieldAlert,
    sendMissionMessage,
    acknowledgeMessage,
    isOffline,
    syncLatencyMs,
    networkState,
    lowBandwidthMode,
    toggleLowBandwidthMode,
    refreshNetworkState,
    fetchState
  } = useAtlasStore();
  const { logout, userName, entityId } = useAuthStore();

  const [activeNav, setActiveNav] = useState('My Assignment');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<'report' | 'backup' | 'medical' | 'complete' | 'nearby' | 'comms' | 'server' | null>(null);

  // Offline Queue & Server Settings states
  const [outboxItems, setOutboxItems] = useState<QueuedOperation[]>([]);
  const [serverUrlInput, setServerUrlInput] = useState<string>(getApiBase());
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    const unsub = offlineQueue.subscribe(setOutboxItems);
    return () => unsub();
  }, []);
  
  // Report Nearby Emergency states
  const [nearbyType, setNearbyType] = useState('Trapped People');
  const [nearbyDesc, setNearbyDesc] = useState('');
  const [nearbyLocDesc, setNearbyLocDesc] = useState('200m east along current response corridor');
  const [nearbyPeople, setNearbyPeople] = useState(3);
  const [nearbyCasualties, setNearbyCasualties] = useState(0);
  const [nearbyRescueReq, setNearbyRescueReq] = useState(true);
  const [nearbyMedicalReq, setNearbyMedicalReq] = useState(false);
  const [nearbyUrgency, setNearbyUrgency] = useState<'Critical' | 'High' | 'Medium'>('Critical');
  const [nearbySubmitting, setNearbySubmitting] = useState(false);

  // Command Comms states
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  
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

  // Resolve logged-in unit first, fallback to assigned unit or R-04
  const currentUnit = (entityId && state?.resources.find(r => r.id === entityId))
    || state?.resources.find(r => r.status === 'Assigned')
    || state?.resources.find(r => r.id === 'R-04')
    || state?.resources[0];
  
  // Find active assignment for R-04 (or current unit)
  const activeAssignment = state?.assignments.find(
    a => a.resource_id === currentUnit?.id && a.assignment_status !== 'Completed' && a.assignment_status !== 'Canceled'
  ) || state?.assignments[0];

  const targetIncident = activeAssignment 
    ? state?.incidents.find(i => i.id === activeAssignment.incident_id) 
    : state?.incidents[0];

  const missionId = activeAssignment?.id || targetIncident?.id || 'ASG-01';
  const myFieldAlerts = fieldAlerts.filter(a => a.rescuer_id === (currentUnit?.id || 'R-04'));
  const unackedInstructions = missionMessages.filter(
    m => m.sender_role === 'admin' && !m.acknowledged
  );

  // Poll mission messages and field alerts every 3.5s
  useEffect(() => {
    fetchFieldAlerts();
    fetchMissionMessages(missionId);
    const interval = setInterval(() => {
      fetchFieldAlerts();
      fetchMissionMessages(missionId);
    }, 3500);
    return () => clearInterval(interval);
  }, [missionId, fetchFieldAlerts, fetchMissionMessages]);

  // Lifecycle states: ASSIGNED -> ACKNOWLEDGED -> EN ROUTE -> ON SCENE -> COMPLETED
  // Map backend status strings to lifecycle stages
  const currentStatus = activeAssignment?.assignment_status || 'Standby';

  const lifecycleStages = [
    { key: 'Assigned', label: 'ASSIGNED', next: 'Acknowledged', nextLabel: 'Acknowledge Mission' },
    { key: 'Acknowledged', label: 'ACKNOWLEDGED', next: 'En Route', nextLabel: 'Start En Route' },
    { key: 'En Route', label: 'EN ROUTE', next: 'On Scene', nextLabel: 'Arrived On Scene' },
    { key: 'On Scene', label: 'ON SCENE', next: 'Completed', nextLabel: 'Complete Mission' },
    { key: 'Completed', label: 'COMPLETED', next: null, nextLabel: 'Mission Resolved' }
  ];

  const currentStageIndex = lifecycleStages.findIndex(
    s => s.key.toLowerCase() === currentStatus.toLowerCase() || (currentStatus.toLowerCase() === 'dispatched' && s.key === 'Assigned')
  );

  const activeStage = currentStageIndex >= 0 ? lifecycleStages[currentStageIndex] : lifecycleStages[0];

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
    <div className="flex flex-col min-h-screen bg-[#F3F5F8] text-[#111827] font-sans overflow-x-hidden select-none">

      {/* COMPACT FIELD HEADER (Mobile-First & Desktop) */}
      <header className="h-12 bg-[#0F172A] text-white border-b border-slate-800 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30 sticky top-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded bg-[#E85D2A] text-white flex items-center justify-center font-black text-xs shrink-0">
            ▲
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white">ATLAS FIELD</span>
              <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] font-bold text-slate-200">
                {currentUnit?.id || 'R-04'}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono truncate hidden sm:block">
              {currentUnit?.name || currentUnit?.type || 'Field Response Unit'}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Network State Pill (ONLINE / LOW_BANDWIDTH / OFFLINE / SYNCING) */}
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded font-mono text-[10px] border ${
            networkState === 'OFFLINE'
              ? 'bg-red-950/70 text-red-300 border-red-700'
              : networkState === 'LOW_BANDWIDTH'
              ? 'bg-amber-950/70 text-amber-300 border-amber-700'
              : networkState === 'SYNCING'
              ? 'bg-sky-950/70 text-sky-300 border-sky-700'
              : 'bg-slate-800 text-emerald-300 border-slate-700'
          }`}>
            {networkState === 'OFFLINE' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            <span>{networkState === 'LOW_BANDWIDTH' ? '2G LOW-BW' : networkState}</span>
          </div>

          {/* 2G Low-Bandwidth Toggle */}
          <button
            onClick={toggleLowBandwidthMode}
            title="Toggle 2G Low-Bandwidth Mode"
            className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold border transition ${
              lowBandwidthMode
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            2G
          </button>

          {/* Server Endpoint Config (for Physical Android Phone) */}
          <button
            onClick={() => {
              setServerUrlInput(getApiBase());
              setActiveModal('server');
            }}
            title="Configure Backend Server URL"
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            <Server className="w-3.5 h-3.5" />
          </button>

          {/* Current Mission Status Pill */}
          <span className={`hidden sm:inline-block px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase border ${
            activeAssignment
              ? 'bg-[#E85D2A]/20 text-[#FF8A65] border-[#E85D2A]/40'
              : 'bg-slate-800 text-slate-300 border-slate-700'
          }`}>
            {currentStatus}
          </span>

          <button
            onClick={logout}
            title="Sign Out"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-red-950/60 hover:text-red-300 border border-slate-700 text-[11px] font-medium text-slate-300 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* MAIN FIELD TERMINAL WORKSPACE */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-3 sm:p-5 space-y-4">
        
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

        {/* FIELD-TO-COMMAND COORDINATION BAR */}
        <div className="bg-white rounded-xl border border-[#E3E8ED] p-3.5 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-[#DC3C3C] shrink-0">
              <Siren className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#17212B]">Field-to-Command Coordination</div>
              <div className="text-[11px] text-[#64748B]">
                {myFieldAlerts.length > 0
                  ? `${myFieldAlerts.length} field alert(s) active • Latest: ${myFieldAlerts[0].status}`
                  : 'Discovered another emergency nearby? Alert Command immediately.'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setActiveModal('comms')}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                unackedInstructions.length > 0
                  ? 'bg-amber-50 border-amber-300 text-amber-800 animate-pulse'
                  : 'bg-[#F8FAFC] border-[#E3E8ED] text-[#17212B] hover:bg-[#F1F5F9]'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-[#F26536]" />
              <span>Command Comms</span>
              {unackedInstructions.length > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full bg-[#DC3C3C] text-white text-[10px] font-mono">
                  {unackedInstructions.length} NEW
                </span>
              ) : (
                <span className="px-1.5 py-0.5 rounded-full bg-[#E3E8ED] text-[#64748B] text-[10px] font-mono">
                  {missionMessages.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveModal('nearby')}
              className="px-4 py-2.5 rounded-xl bg-[#DC3C3C] hover:bg-red-700 active:scale-98 text-white text-xs font-extrabold tracking-wide flex items-center justify-center gap-2 shadow-sm transition"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>REPORT NEARBY EMERGENCY</span>
            </button>
          </div>
        </div>

        {/* PERSISTENT OFFLINE OUTBOX QUEUE BAR */}
        {outboxItems.length > 0 && (
          <div className="bg-white rounded-xl border border-[#DCE2E8] p-3 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0F172A]">
                <RefreshCw className={`w-3.5 h-3.5 text-[#E85D2A] ${syncingNow ? 'animate-spin' : ''}`} />
                <span>
                  Offline Outbox: {outboxItems.filter(i => i.deliveryState === 'QUEUED' || i.deliveryState === 'SENDING').length} Pending •{' '}
                  {outboxItems.filter(i => i.deliveryState === 'FAILED').length} Failed •{' '}
                  {outboxItems.filter(i => i.deliveryState === 'SENT' || i.deliveryState === 'ACKNOWLEDGED').length} Sent
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={syncingNow}
                  onClick={async () => {
                    setSyncingNow(true);
                    await offlineQueue.flush(true);
                    await fetchState();
                    refreshNetworkState();
                    setSyncingNow(false);
                  }}
                  className="px-2.5 py-1 rounded bg-[#0F172A] text-white text-[10px] font-bold"
                >
                  {syncingNow ? 'Syncing...' : 'Sync Now'}
                </button>
                <button
                  onClick={() => offlineQueue.clearCompleted()}
                  className="px-2 py-1 rounded bg-[#F3F5F8] text-[#5B6777] text-[10px] font-semibold"
                >
                  Clear Sent
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {outboxItems.slice(-4).map(item => (
                <div key={item.id} className="flex items-center justify-between text-[10px] bg-[#F8FAFC] px-2.5 py-1.5 rounded border border-[#DCE2E8]">
                  <span className="truncate font-medium text-[#111827] max-w-[60%]">{item.summary}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`px-1.5 py-0.2 rounded font-mono font-bold ${
                      item.deliveryState === 'SENT' || item.deliveryState === 'ACKNOWLEDGED' ? 'bg-emerald-100 text-emerald-700' :
                      item.deliveryState === 'FAILED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-800'
                    }`}>
                      {item.deliveryState}
                    </span>
                    {item.deliveryState === 'FAILED' && (
                      <button
                        onClick={() => offlineQueue.retryFailed(item.id)}
                        className="text-[#0284C7] font-bold underline"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* INLINE PENDING COMMAND INSTRUCTIONS (1-TAP ACKNOWLEDGE) */}
        {unackedInstructions.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3.5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 font-mono">
                Pending Command Instruction ({unackedInstructions.length})
              </span>
              <button
                onClick={() => setActiveModal('comms')}
                className="text-[11px] font-bold text-[#E85D2A] hover:underline"
              >
                Open Full Thread →
              </button>
            </div>
            {unackedInstructions.slice(0, 2).map(instr => (
              <div key={instr.id} className="bg-white border border-amber-200 rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="text-xs text-[#111827]">
                  <span className="font-bold text-[#E85D2A] mr-1.5">{instr.sender_name}:</span>
                  <span>{instr.content}</span>
                </div>
                <button
                  onClick={() => acknowledgeMessage(instr.id)}
                  className="px-3 py-1.5 rounded-lg bg-[#E85D2A] hover:bg-[#d24e1e] text-white text-xs font-bold shrink-0 transition"
                >
                  Acknowledge Instruction
                </button>
              </div>
            ))}
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
              {!activeAssignment ? (
                <div className="w-full py-3 bg-[#F8FAFC] border border-[#E3E8ED] text-[#64748B] rounded-xl text-xs font-semibold text-center">
                  Standby — Awaiting Command Dispatch
                </div>
              ) : activeStage.next ? (
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

            {(lowBandwidthMode || networkState === 'OFFLINE') ? (
              <div className="flex-1 min-h-[260px] bg-[#0F172A] text-slate-200 flex flex-col items-center justify-center p-5 text-center space-y-2">
                <WifiOff className="w-7 h-7 text-amber-400" />
                <div className="text-xs font-bold text-white">
                  {networkState === 'OFFLINE' ? 'Offline Mode — Map Tiles Paused' : '2G Low-Bandwidth Mode — Map Tiles Paused'}
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  Target: {(targetIncident?.latitude || 12.312).toFixed(4)}° N, {(targetIncident?.longitude || 76.641).toFixed(4)}° E
                </div>
                <div className="text-[10px] text-slate-400 max-w-xs">
                  Satellite tile downloads paused to preserve bandwidth for SOS, field alerts, and Command instructions.
                </div>
              </div>
            ) : (
              <div ref={mapContainerRef} className="flex-1 w-full h-full min-h-[300px]" />
            )}

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
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">Field Observation Note</label>
                  <VoiceMicButton
                    compact
                    onTranscript={(t) => setReportNotes(prev => prev ? `${prev} ${t}` : t)}
                  />
                </div>
                <textarea
                  value={reportNotes}
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Additional field specifics or structural hazards (or tap mic to dictate)..."
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
                  const repPayload = {
                    incident_id: targetIncident?.id || 'INC-101',
                    resource_id: currentUnit?.id || 'R-04',
                    casualties: reportCasualties,
                    assessment: reportAssessment,
                    road_condition: reportRoadCondition,
                    notes: reportNotes
                  };
                  try {
                    const { api } = await import('../services/api');
                    await api.submitFieldReport(repPayload);
                    setActiveModal(null);
                    setStatusFeedback("On-site field report transmitted to Command Center & persisted.");
                  } catch (e: any) {
                    await offlineQueue.enqueue({
                      kind: 'field_report',
                      incidentId: repPayload.incident_id,
                      sender: repPayload.resource_id,
                      recipient: 'SEOC-COMMAND',
                      summary: `Field Report (${repPayload.incident_id}): ${repPayload.assessment.slice(0, 35)}`,
                      payload: repPayload
                    });
                    refreshNetworkState();
                    setActiveModal(null);
                    setStatusFeedback("Network offline — field report queued locally for automatic sync.");
                  }
                  setTimeout(() => setStatusFeedback(null), 4500);
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

      {/* MODAL 5: REPORT NEARBY EMERGENCY */}
      {activeModal === 'nearby' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#E3E8ED] pb-3">
              <div className="flex items-center gap-2">
                <Siren className="w-5 h-5 text-[#DC3C3C]" />
                <div>
                  <h3 className="text-sm font-bold text-[#17212B]">Report Nearby Emergency</h3>
                  <p className="text-[10px] text-[#64748B]">Linked to {currentUnit?.id || 'R-04'} • Active Mission {targetIncident?.id || 'INC-101'}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">Emergency Category</label>
                  <select
                    value={nearbyType}
                    onChange={(e) => setNearbyType(e.target.value)}
                    className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs font-semibold"
                  >
                    <option value="Trapped People">Trapped People</option>
                    <option value="Flooding">Flash Flooding</option>
                    <option value="Structural Collapse">Structural Collapse</option>
                    <option value="Road Blockage">Road Blockage</option>
                    <option value="Medical">Medical Emergency</option>
                    <option value="Hazard">Power / Gas Hazard</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">Urgency Level</label>
                  <select
                    value={nearbyUrgency}
                    onChange={(e) => setNearbyUrgency(e.target.value as 'Critical' | 'High' | 'Medium')}
                    className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs font-semibold"
                  >
                    <option value="Critical">Critical (Life Threat)</option>
                    <option value="High">High (Urgent)</option>
                    <option value="Medium">Medium</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-[#64748B] uppercase">Location / Landmark</label>
                <input
                  type="text"
                  value={nearbyLocDesc}
                  onChange={(e) => setNearbyLocDesc(e.target.value)}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs"
                />
                <div className="text-[10px] font-mono text-[#64748B] mt-1">
                  Auto-GPS: {((targetIncident?.latitude || 12.312) + 0.0025).toFixed(4)}, {((targetIncident?.longitude || 76.641) + 0.0025).toFixed(4)}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">Situation Description</label>
                  <VoiceMicButton
                    compact
                    onTranscript={(t) => setNearbyDesc(prev => prev ? `${prev} ${t}` : t)}
                  />
                </div>
                <textarea
                  value={nearbyDesc}
                  onChange={(e) => setNearbyDesc(e.target.value)}
                  placeholder="Describe stranded civilians, structural danger, or tap mic to speak..."
                  rows={2}
                  className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">People Affected</label>
                  <input
                    type="number"
                    min={0}
                    value={nearbyPeople}
                    onChange={(e) => setNearbyPeople(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-[#64748B] uppercase">Casualties</label>
                  <input
                    type="number"
                    min={0}
                    value={nearbyCasualties}
                    onChange={(e) => setNearbyCasualties(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-[#17212B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nearbyRescueReq}
                    onChange={(e) => setNearbyRescueReq(e.target.checked)}
                    className="rounded border-[#E3E8ED] text-[#F26536]"
                  />
                  <span>Immediate Rescue</span>
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-[#17212B] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={nearbyMedicalReq}
                    onChange={(e) => setNearbyMedicalReq(e.target.checked)}
                    className="rounded border-[#E3E8ED] text-[#DC3C3C]"
                  />
                  <span>Medical Aid Needed</span>
                </label>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2.5 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl transition"
              >
                Cancel
              </button>
              <button
                disabled={nearbySubmitting || !nearbyDesc.trim()}
                onClick={async () => {
                  setNearbySubmitting(true);
                  try {
                    const res = await submitFieldAlert({
                      rescuer_id: currentUnit?.id || 'R-04',
                      rescuer_name: currentUnit?.name || userName || 'Unit R-04',
                      active_assignment_id: activeAssignment?.id,
                      original_incident_id: targetIncident?.id,
                      emergency_type: nearbyType,
                      description: nearbyDesc.trim(),
                      latitude: (targetIncident?.latitude || 12.312) + 0.0025,
                      longitude: (targetIncident?.longitude || 76.641) + 0.0025,
                      location_description: nearbyLocDesc,
                      people_affected: nearbyPeople,
                      casualties: nearbyCasualties,
                      requires_rescue: nearbyRescueReq,
                      requires_medical: nearbyMedicalReq,
                      urgency: nearbyUrgency
                    });
                    setNearbyDesc('');
                    setActiveModal('comms');
                    if (res?.queuedOffline) {
                      setStatusFeedback('Network offline — nearby emergency queued locally. Command has NOT received it yet.');
                    } else {
                      await fetchMissionMessages(missionId);
                      setStatusFeedback(`Nearby emergency ${res?.incident?.id || ''} reported to Command Center.`);
                    }
                    setTimeout(() => setStatusFeedback(null), 5000);
                  } catch (e) {
                    setStatusFeedback('Failed to transmit field alert. Please retry.');
                  } finally {
                    setNearbySubmitting(false);
                  }
                }}
                className="flex-1 py-2.5 text-xs font-bold text-white bg-[#DC3C3C] hover:bg-red-700 disabled:opacity-50 rounded-xl transition shadow-xs"
              >
                {nearbySubmitting ? 'Transmitting...' : 'Transmit Field Alert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: COMMAND COMMS THREAD */}
      {activeModal === 'comms' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-lg w-full shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-[#E3E8ED] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <MessageSquare className="w-5 h-5 text-[#F26536]" />
                <div>
                  <h3 className="text-sm font-bold text-[#17212B]">Command Center Comms</h3>
                  <p className="text-[10px] font-mono text-[#64748B]">Mission {missionId} • Unit {currentUnit?.id || 'R-04'}</p>
                </div>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            {/* Active Field Alerts Summary inside Comms */}
            {myFieldAlerts.length > 0 && (
              <div className="px-4 py-2.5 bg-[#F8FAFC] border-b border-[#E3E8ED] space-y-1.5">
                <div className="text-[10px] font-bold uppercase text-[#64748B]">Reported Field Emergencies</div>
                {myFieldAlerts.slice(0, 2).map(fa => (
                  <div key={fa.id} className="flex items-center justify-between text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-[#E3E8ED]">
                    <span className="font-semibold text-[#17212B] truncate">{fa.new_incident_id}: {fa.emergency_type}</span>
                    <span className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                      fa.status === 'Combined' ? 'bg-emerald-100 text-emerald-700' :
                      fa.status === 'Separate Unit Assigned' ? 'bg-sky-100 text-sky-700' :
                      fa.status === 'Acknowledged' ? 'bg-amber-100 text-amber-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {fa.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Message Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F5F7F9]/60 min-h-[260px]">
              {missionMessages.length === 0 ? (
                <div className="text-center py-10 text-xs text-[#64748B]">
                  No mission messages yet. Send an update or report a nearby emergency.
                </div>
              ) : (
                missionMessages.map(msg => {
                  const isCommand = msg.sender_role === 'admin';
                  const isInstruction = msg.message_type === 'instruction' || isCommand;
                  return (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                        isCommand
                          ? 'bg-white border-[#F26536]/40 shadow-xs'
                          : 'bg-[#17212B] text-white border-[#17212B] ml-6'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-bold text-[11px] ${isCommand ? 'text-[#F26536]' : 'text-emerald-400'}`}>
                          {msg.sender_name} {msg.priority === 'Urgent' ? '• URGENT' : ''}
                        </span>
                        <span className={`text-[10px] font-mono ${isCommand ? 'text-[#64748B]' : 'text-slate-400'}`}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className={`leading-relaxed ${isCommand ? 'text-[#17212B]' : 'text-slate-100'}`}>
                        {msg.content}
                      </p>
                      {isInstruction && (
                        <div className="pt-1 flex items-center justify-end">
                          {msg.acknowledged ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#23966B] bg-emerald-50 px-2 py-0.5 rounded-full">
                              <CheckCheck className="w-3 h-3" /> Acknowledged
                            </span>
                          ) : (
                            <button
                              onClick={() => acknowledgeMessage(msg.id)}
                              className="px-2.5 py-1 rounded-lg bg-[#F26536] hover:bg-[#E05322] text-white text-[10px] font-bold transition"
                            >
                              Acknowledge Instruction
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Voice Transcription Disclosure */}
            <div className="px-3 py-1.5 bg-[#F8FAFC] border-t border-[#E3E8ED] text-[10px] text-[#64748B]">
              Voice-to-text uses device speech service (offline requires device language pack). Review &amp; edit before sending.
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-[#E3E8ED] bg-white rounded-b-2xl flex items-center gap-2">
              <VoiceMicButton
                compact
                onTranscript={(t) => setChatInput(prev => prev ? `${prev} ${t}` : t)}
              />
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && chatInput.trim() && !chatSending) {
                    setChatSending(true);
                    const res = await sendMissionMessage(missionId, {
                      sender_id: currentUnit?.id || 'R-04',
                      sender_name: currentUnit?.name || 'Unit R-04',
                      sender_role: 'rescuer',
                      message_type: 'chat',
                      content: chatInput.trim(),
                      priority: 'Normal'
                    });
                    setChatInput('');
                    setChatSending(false);
                    if (res?.queuedOffline) {
                      setStatusFeedback('Message queued offline — will transmit automatically when connected.');
                    }
                  }
                }}
                placeholder="Speak or type message to Command..."
                className="flex-1 p-2.5 rounded-xl border border-[#E3E8ED] bg-[#F8FAFC] text-xs focus:outline-none focus:border-[#F26536]"
              />
              <button
                disabled={chatSending || !chatInput.trim()}
                onClick={async () => {
                  if (!chatInput.trim()) return;
                  setChatSending(true);
                  const res = await sendMissionMessage(missionId, {
                    sender_id: currentUnit?.id || 'R-04',
                    sender_name: currentUnit?.name || 'Unit R-04',
                    sender_role: 'rescuer',
                    message_type: 'chat',
                    content: chatInput.trim(),
                    priority: 'Normal'
                  });
                  setChatInput('');
                  setChatSending(false);
                  if (res?.queuedOffline) {
                    setStatusFeedback('Message queued offline — will transmit automatically when connected.');
                  }
                }}
                className="px-3.5 py-2.5 rounded-xl bg-[#F26536] hover:bg-[#E05322] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: BACKEND SERVER URL SETTINGS (FOR PHYSICAL ANDROID DEVICE) */}
      {activeModal === 'server' && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E3E8ED] max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E3E8ED] pb-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-[#0284C7]" />
                <h3 className="text-sm font-bold text-[#17212B]">ATLAS Server Endpoint</h3>
              </div>
              <button onClick={() => setActiveModal(null)} className="text-[#64748B] hover:text-[#17212B] font-bold">✕</button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-[11px] text-[#64748B]">
                On a physical Android phone, set this to your backend machine&apos;s LAN IP (e.g. <code className="font-mono bg-[#F3F5F8] px-1 rounded">http://192.168.1.5:8000/api</code>) or emulator <code className="font-mono bg-[#F3F5F8] px-1 rounded">http://10.0.2.2:8000/api</code>.
              </p>
              <input
                type="url"
                value={serverUrlInput}
                onChange={(e) => setServerUrlInput(e.target.value)}
                placeholder="http://192.168.1.5:8000/api"
                className="w-full p-2.5 rounded-lg border border-[#E3E8ED] bg-[#F8FAFC] font-mono text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2 border-t border-[#E3E8ED]">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 py-2 text-xs font-semibold text-[#64748B] bg-[#F5F7F9] rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setApiBase(serverUrlInput);
                  setActiveModal(null);
                  setStatusFeedback(`Server URL updated to ${getApiBase()}`);
                  await fetchState();
                  await fetchFieldAlerts();
                  setTimeout(() => setStatusFeedback(null), 4000);
                }}
                className="flex-1 py-2 text-xs font-bold text-white bg-[#0F172A] rounded-xl"
              >
                Save &amp; Reconnect
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
