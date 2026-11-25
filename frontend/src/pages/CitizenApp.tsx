import React, { useState, useEffect, useRef } from 'react';
import {
  Home,
  Map as MapIcon,
  Bell,
  User,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Phone,
  Crosshair,
  Flame,
  Plus,
  Minus,
  Building2,
  ShieldCheck,
  Navigation,
  Clock,
  LifeBuoy,
  FileText,
  Layers,
  Share2,
  Info,
  ChevronRight,
  ExternalLink,
  Sliders,
  Compass
} from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';

export const CitizenApp: React.FC = () => {
  const { state, submitSOS } = useAtlasStore();

  // Navigation: Bottom Tabs ('home' | 'map' | 'updates' | 'profile')
  // Or dedicated sub-flows: 'sos_step1' | 'sos_step2' | 'sos_step3' | 'sos_submitted' | 'sos_tracking'
  const [activeTab, setActiveTab] = useState<'home' | 'map' | 'updates' | 'profile'>('home');
  const [currentView, setCurrentView] = useState<'tab' | 'sos_1' | 'sos_2' | 'sos_3' | 'sos_submitted' | 'sos_tracking'>('tab');

  // SOS Form States (Step 1 -> 4)
  const [selectedEmergency, setSelectedEmergency] = useState<string>('Flooding');
  const [locationName, setLocationName] = useState<string>('Vijayanagar, Mysuru');
  const [locationCoords, setLocationCoords] = useState<[number, number]>([12.3180, 76.6430]);
  const [locationMode, setLocationMode] = useState<'gps' | 'map' | 'manual'>('gps');

  // Step 3 Details
  const [peopleAffected, setPeopleAffected] = useState<number>(2);
  const [situationDetails, setSituationDetails] = useState<string>('Water entering our house, we are unable to move.');
  const [hasMedicalHelp, setHasMedicalHelp] = useState<boolean>(false);
  const [hasElderlyOrDisabled, setHasElderlyOrDisabled] = useState<boolean>(true);

  // Active / Submitted incident tracking
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string>('INC-1043');
  const [activeTrackingData, setActiveTrackingData] = useState<{
    id: string;
    type: string;
    location: string;
    eta: string;
    team: string;
    status: 'Request Received' | 'Rescue Team Assigned' | 'En Route' | 'On Site' | 'Resolved';
    timeline: { step: string; time: string; done: boolean; active?: boolean }[];
  }>({
    id: 'INC-1043',
    type: 'Flooding',
    location: 'Vijayanagar, Mysuru',
    eta: '~ 7 min',
    team: 'R-04 (Water Rescue)',
    status: 'En Route',
    timeline: [
      { step: 'Request Received', time: '18:01', done: true },
      { step: 'Rescue Team Assigned', time: '18:03', done: true },
      { step: 'En Route', time: '18:05', done: true, active: true },
      { step: 'On Site', time: '--', done: false }
    ]
  });

  // Dedicated Map View reference
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Sync with live backend incident if matching
  useEffect(() => {
    if (state?.incidents && activeIncidentId) {
      const match = state.incidents.find(i => i.id === activeIncidentId);
      if (match) {
        setActiveTrackingData(prev => ({
          ...prev,
          type: match.type || prev.type,
          location: 'Vijayanagar, Mysuru',
          status: (match.status === 'Assigned' || match.status === 'In Progress') ? 'En Route' : 'Request Received'
        }));
      }
    }
  }, [state, activeIncidentId]);

  // Emergency Categories for Step 1
  const emergencyTypes = [
    { id: 'Flooding', label: 'Flooding', icon: '🌊' },
    { id: 'Medical Emergency', label: 'Medical Emergency', icon: '➕' },
    { id: 'Trapped / Need Rescue', label: 'Trapped / Need Rescue', icon: '👥' },
    { id: 'Road Blockage', label: 'Road Blockage', icon: '⚠️' },
    { id: 'Fire', label: 'Fire', icon: '🔥' },
    { id: 'Other', label: 'Other', icon: '•••' }
  ];

  // Submit SOS to real backend
  const handleFinalSOSSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const additionalNotes = [
        situationDetails,
        hasMedicalHelp ? 'Injured/Medical help needed' : '',
        hasElderlyOrDisabled ? 'Elderly/Person with disability' : ''
      ].filter(Boolean).join('. ');

      const res = await submitSOS({
        type: selectedEmergency,
        description: `Citizen SOS in ${locationName}: ${additionalNotes}`,
        latitude: locationCoords[0],
        longitude: locationCoords[1],
        affected_population: peopleAffected
      });

      if (!res || !res.id) {
        throw new Error("Invalid incident response returned from ATLAS SEOC.");
      }

      const newId = res.id;
      setActiveIncidentId(newId);
      setActiveTrackingData({
        id: newId,
        type: res.type || selectedEmergency,
        location: locationName,
        eta: '~ 7 min',
        team: 'Dispatched to Response Grid',
        status: 'Request Received',
        timeline: [
          { step: 'Request Received', time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }), done: true, active: true },
          { step: 'Rescue Team Assigned', time: '--', done: false },
          { step: 'En Route', time: '--', done: false },
          { step: 'On Site', time: '--', done: false }
        ]
      });

      setCurrentView('sos_submitted');
    } catch (e: any) {
      console.error("SOS submission error:", e);
      setSubmitError(e?.message || 'Emergency transmission failed. Please retry or contact emergency services directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize Map for Safety Map Tab or Step 2 Mini Map
  useEffect(() => {
    if (activeTab === 'map' && currentView === 'tab') {
      if (!mapContainerRef.current) return;
      if (mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            'osm-raster': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors'
            }
          },
          layers: [
            {
              id: 'osm-layer',
              type: 'raster',
              source: 'osm-raster',
              minzoom: 0,
              maxzoom: 19
            }
          ]
        },
        center: [76.6430, 12.3180],
        zoom: 13,
        attributionControl: false
      });

      mapRef.current = map;

      map.on('load', () => {
        // User pin
        const userEl = document.createElement('div');
        userEl.className = 'w-7 h-7 rounded-full bg-[#FF5A24] border-2 border-white flex items-center justify-center text-white shadow-md text-xs font-bold';
        userEl.innerHTML = '📍';
        new maplibregl.Marker({ element: userEl }).setLngLat([76.6430, 12.3180]).addTo(map);

        // Shelter pins
        const shelter1 = document.createElement('div');
        shelter1.className = 'w-6 h-6 rounded-full bg-[#16865D] border border-white flex items-center justify-center text-white shadow text-xs';
        shelter1.innerHTML = '🏠';
        new maplibregl.Marker({ element: shelter1 }).setLngLat([76.6190, 12.3274]).addTo(map);

        // Hospital pin
        const hosp1 = document.createElement('div');
        hosp1.className = 'w-6 h-6 rounded-full bg-[#4386C6] border border-white flex items-center justify-center text-white shadow text-xs';
        hosp1.innerHTML = '🏥';
        new maplibregl.Marker({ element: hosp1 }).setLngLat([76.6496, 12.3168]).addTo(map);
      });

      return () => {
        map.remove();
        mapRef.current = null;
      };
    } else {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    }
  }, [activeTab, currentView]);

  return (
    <div className="min-h-screen bg-[#F0F2F5] flex flex-col items-center justify-center p-0 sm:p-4 font-sans text-[#18212B] select-none">

      {/* NATIVE MOBILE CONTAINER (Framed device shell matching modern smartphone) */}
      <div className="w-full max-w-[412px] h-[100dvh] sm:h-[844px] bg-white sm:rounded-[44px] sm:border-[8px] sm:border-[#1E293B] shadow-2xl flex flex-col justify-between overflow-hidden relative">

        {/* 1. NATIVE STATUS BAR (18:01, Camera hole-punch, Signal & Battery 95%) */}
        <div className="pt-2 px-6 pb-1 bg-white flex items-center justify-between text-xs font-semibold text-[#18212B] shrink-0 z-30">
          <span className="font-mono text-[13px] tracking-tight">18:01</span>

          {/* Subtle selfie camera cutout */}
          <div className="w-3.5 h-3.5 bg-black rounded-full mx-auto" />

          <div className="flex items-center gap-1.5 text-[11px] font-mono">
            <span>📶</span>
            <span>95%</span>
          </div>
        </div>

        {/* 2. DYNAMIC WORKSPACE (Screens operated inside one unified app) */}
        <div className="flex-1 flex flex-col overflow-y-auto relative">

          {/* ============================================================== */}
          {/* SCREEN 1: HOME PAGE (activeTab === 'home' && currentView === 'tab') */}
          {/* ============================================================== */}
          {activeTab === 'home' && currentView === 'tab' && (
            <div className="flex-1 px-5 py-3 flex flex-col justify-between space-y-4">

              {/* Brand Header */}
              <div className="flex flex-col items-center text-center pt-1">
                <div className="w-6 h-6 text-[#FF5A24] mb-0.5">
                  <svg viewBox="0 0 28 28" fill="currentColor">
                    <path d="M14 3L2 23H7L14 11L21 23H26L14 3Z" fill="#FF5A24" />
                  </svg>
                </div>
                <div className="text-xs font-extrabold tracking-wider text-[#18212B] leading-none">
                  ATLAS
                </div>
                <div className="text-[10px] text-[#687789] font-medium tracking-tight mt-0.5">
                  Disaster Response Network
                </div>
              </div>

              {/* Hero Banner with Mysuru Palace Graphic */}
              <div className="flex items-center justify-between pt-1">
                <div>
                  <h1 className="text-2xl font-black text-[#18212B] leading-tight">
                    Stay Safe<br />Mysuru
                  </h1>
                  <p className="text-xs text-[#687789] mt-1 max-w-[180px] leading-snug">
                    Report emergencies, get help, and stay updated.
                  </p>
                </div>

                <div className="w-28 h-24 relative flex items-center justify-center shrink-0">
                  <img
                    src="/mysuru-palace-trans.png"
                    alt="Mysuru Heritage Landmark"
                    className="w-full h-auto object-contain opacity-90 drop-shadow-xs"
                  />
                </div>
              </div>

              {/* Prominent Primary SOS Button */}
              <div className="pt-1">
                <button
                  onClick={() => setCurrentView('sos_1')}
                  className="w-full py-4 px-5 rounded-2xl bg-[#FF5A24] hover:bg-[#E04D1B] active:scale-98 text-white shadow-lg shadow-orange-500/25 flex items-center justify-between transition group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg">
                      🚨
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-black tracking-wide leading-tight">SOS</div>
                      <div className="text-xs text-white/90 font-medium">Request Immediate Help</div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/90 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              {/* 4 Compact Action Tiles */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {/* 1. Report an Incident */}
                <button
                  onClick={() => {
                    setSelectedEmergency('Flooding');
                    setCurrentView('sos_1');
                  }}
                  className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs hover:border-[#FF5A24]/40 flex flex-col items-center justify-center text-center gap-1.5 transition active:scale-98"
                >
                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#FF5A24]">
                    <FileText className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#18212B] leading-tight">Report an<br />Incident</span>
                </button>

                {/* 2. Nearby Shelters */}
                <button
                  onClick={() => {
                    setActiveTab('map');
                    setCurrentView('tab');
                  }}
                  className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs hover:border-[#FF5A24]/40 flex flex-col items-center justify-center text-center gap-1.5 transition active:scale-98"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-[#16865D]">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#18212B] leading-tight">Nearby<br />Shelters</span>
                </button>

                {/* 3. Emergency Contacts */}
                <button
                  onClick={() => alert("Mysuru Emergency Helplines:\n• Police Control: 112\n• Fire & Rescue: 101\n• Ambulance & Trauma: 108\n• District Disaster Cell: 0821-2423800")}
                  className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs hover:border-[#FF5A24]/40 flex flex-col items-center justify-center text-center gap-1.5 transition active:scale-98"
                >
                  <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center text-[#D93636]">
                    <Phone className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#18212B] leading-tight">Emergency<br />Contacts</span>
                </button>

                {/* 4. Check Updates */}
                <button
                  onClick={() => {
                    setActiveTab('updates');
                    setCurrentView('tab');
                  }}
                  className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs hover:border-[#FF5A24]/40 flex flex-col items-center justify-center text-center gap-1.5 transition active:scale-98"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#4386C6]">
                    <Bell className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-bold text-[#18212B] leading-tight">Check<br />Updates</span>
                </button>
              </div>

              {/* Verified Disaster Advisory Strip */}
              <div className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E1E7ED] flex items-center gap-2.5 text-xs text-[#687789]">
                <span className="w-2 h-2 rounded-full bg-[#16865D] shrink-0 animate-pulse" />
                <div className="leading-snug truncate">
                  <span className="font-bold text-[#18212B]">Mysuru Response Zone:</span> Flood alert active in low-lying canal sectors.
                </div>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 2: SOS STEP 1/4 - WHAT'S THE EMERGENCY? */}
          {/* ============================================================== */}
          {currentView === 'sos_1' && (
            <div className="flex-1 px-5 py-4 flex flex-col justify-between">
              <div>
                {/* Top Back & Header */}
                <div className="flex items-center justify-between pb-3">
                  <button
                    onClick={() => setCurrentView('tab')}
                    className="p-1 -ml-1 text-[#18212B] hover:text-[#FF5A24] transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-sm font-bold text-[#18212B]">SOS Request</h2>
                  <span className="text-xs font-mono text-[#687789]">1 / 4</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-[#E1E7ED] rounded-full overflow-hidden mb-5">
                  <div className="w-1/4 h-full bg-[#FF5A24] rounded-full transition-all duration-300" />
                </div>

                <h3 className="text-lg font-black text-[#18212B] mb-4">
                  What's the Emergency?
                </h3>

                {/* Category Radio Cards */}
                <div className="space-y-2.5">
                  {emergencyTypes.map((type) => {
                    const isSelected = selectedEmergency === type.id;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setSelectedEmergency(type.id)}
                        className={`w-full p-3 rounded-2xl border flex items-center justify-between transition text-left ${isSelected
                            ? 'bg-[#FFF2EC] border-[#FF5A24] text-[#FF5A24] shadow-2xs'
                            : 'bg-white border-[#E1E7ED] text-[#18212B] hover:bg-[#F8FAFC]'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{type.icon}</span>
                          <span className="text-sm font-bold">{type.label}</span>
                        </div>

                        {/* Radio selection circle */}
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#FF5A24]' : 'border-[#CBD5E1]'
                          }`}>
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#FF5A24]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Next Step Action */}
              <div className="pt-4">
                <button
                  onClick={() => setCurrentView('sos_2')}
                  className="w-full py-3.5 rounded-2xl bg-[#FF5A24] hover:bg-[#E04D1B] active:scale-98 text-white font-bold text-sm shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2"
                >
                  <span>Next</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 3: SOS STEP 2/4 - CONFIRM LOCATION */}
          {/* ============================================================== */}
          {currentView === 'sos_2' && (
            <div className="flex-1 px-5 py-4 flex flex-col justify-between">
              <div>
                {/* Top Back & Header */}
                <div className="flex items-center justify-between pb-3">
                  <button
                    onClick={() => setCurrentView('sos_1')}
                    className="p-1 -ml-1 text-[#18212B] hover:text-[#FF5A24] transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-sm font-bold text-[#18212B]">SOS Request</h2>
                  <span className="text-xs font-mono text-[#687789]">2 / 4</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-[#E1E7ED] rounded-full overflow-hidden mb-4">
                  <div className="w-2/4 h-full bg-[#FF5A24] rounded-full transition-all duration-300" />
                </div>

                <h3 className="text-lg font-black text-[#18212B]">
                  Confirm Location
                </h3>
                <p className="text-xs text-[#687789] mt-0.5 mb-3 leading-snug">
                  Share your location so response teams can reach you faster.
                </p>

                {/* Stylized Mini Map with Floating Location Bubble */}
                <div className="w-full h-44 rounded-2xl overflow-hidden border border-[#E1E7ED] bg-[#F1F5F9] relative flex items-center justify-center mb-3 shadow-2xs">
                  {/* Map Grid Graphic background */}
                  <div
                    className="absolute inset-0 opacity-40 bg-[radial-gradient(#94A3B8_1px,transparent_1px)] [background-size:12px_12px]"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-full h-full opacity-30" viewBox="0 0 300 160">
                      <path d="M0 60 Q80 80 150 40 T300 80" stroke="#CBD5E1" strokeWidth="6" fill="none" />
                      <path d="M60 0 L180 160" stroke="#CBD5E1" strokeWidth="4" fill="none" />
                      <path d="M120 160 Q170 90 260 0" stroke="#94A3B8" strokeWidth="5" fill="none" />
                    </svg>
                  </div>

                  {/* Floating Bubble: Vijayanagar, Mysuru */}
                  <div className="absolute top-3 bg-white/95 backdrop-blur-xs border border-[#E1E7ED] px-3 py-1 rounded-full text-xs font-bold text-[#18212B] shadow-sm flex items-center gap-1.5 z-10">
                    <MapPin className="w-3.5 h-3.5 text-[#FF5A24]" />
                    <span>{locationName}</span>
                  </div>

                  {/* Pulse Center Target */}
                  <div className="relative flex items-center justify-center z-10">
                    <div className="w-16 h-16 rounded-full bg-[#4386C6]/20 animate-ping absolute" />
                    <div className="w-10 h-10 rounded-full bg-[#4386C6]/30 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-[#4386C6] border-2 border-white shadow-md" />
                    </div>
                  </div>

                  {/* Recenter button */}
                  <button
                    onClick={() => alert("GPS lock verified: 12.3180° N, 76.6430° E")}
                    className="absolute bottom-2 right-2 p-2 rounded-full bg-white shadow-md border border-[#E1E7ED] text-[#18212B] active:scale-90 transition z-10"
                  >
                    <Crosshair className="w-4 h-4 text-[#FF5A24]" />
                  </button>
                </div>

                {/* Location Selection Options */}
                <div className="space-y-2">
                  {/* Verified GPS option */}
                  <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#16865D]" />
                      <span className="text-xs font-bold text-[#18212B]">{locationName}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#16865D] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      GPS: Accurate
                    </span>
                  </div>

                  {/* Select on Map */}
                  <button
                    onClick={() => alert("Tap anywhere on the map to pin alternate location.")}
                    className="w-full p-3 bg-white rounded-xl border border-[#E1E7ED] hover:bg-[#F8FAFC] flex items-center justify-between text-left transition"
                  >
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-[#18212B]">
                      <Compass className="w-4 h-4 text-[#687789]" />
                      <span>Select on Map</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#687789]" />
                  </button>

                  {/* Enter Manually */}
                  <button
                    onClick={() => {
                      const manual = prompt("Enter specific landmark or street address in Mysuru:", locationName);
                      if (manual) setLocationName(manual);
                    }}
                    className="w-full p-3 bg-white rounded-xl border border-[#E1E7ED] hover:bg-[#F8FAFC] flex items-center justify-between text-left transition"
                  >
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-[#18212B]">
                      <FileText className="w-4 h-4 text-[#687789]" />
                      <span>Enter Address Manually</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#687789]" />
                  </button>
                </div>
              </div>

              {/* Next Step Action */}
              <div className="pt-4">
                <button
                  onClick={() => setCurrentView('sos_3')}
                  className="w-full py-3.5 rounded-2xl bg-[#FF5A24] hover:bg-[#E04D1B] active:scale-98 text-white font-bold text-sm shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2"
                >
                  <span>Next</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 4: SOS STEP 3/4 - PROVIDE DETAILS */}
          {/* ============================================================== */}
          {currentView === 'sos_3' && (
            <div className="flex-1 px-5 py-4 flex flex-col justify-between">
              <div>
                {/* Top Back & Header */}
                <div className="flex items-center justify-between pb-3">
                  <button
                    onClick={() => setCurrentView('sos_2')}
                    className="p-1 -ml-1 text-[#18212B] hover:text-[#FF5A24] transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-sm font-bold text-[#18212B]">SOS Request</h2>
                  <span className="text-xs font-mono text-[#687789]">3 / 4</span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1 bg-[#E1E7ED] rounded-full overflow-hidden mb-4">
                  <div className="w-3/4 h-full bg-[#FF5A24] rounded-full transition-all duration-300" />
                </div>

                <h3 className="text-lg font-black text-[#18212B]">
                  Provide Details
                </h3>

                {/* Number of people affected stepper */}
                <div className="mt-4">
                  <label className="text-xs font-bold text-[#18212B] flex items-center gap-1">
                    <span>Number of people affected</span>
                    <span className="text-[#D93636]">*</span>
                  </label>
                  <div className="mt-2 flex items-center gap-4">
                    <button
                      onClick={() => setPeopleAffected(Math.max(1, peopleAffected - 1))}
                      className="w-10 h-10 rounded-xl border border-[#E1E7ED] bg-white flex items-center justify-center text-lg font-bold text-[#18212B] active:scale-90 transition shadow-2xs"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="text-lg font-bold text-[#18212B] font-mono min-w-[24px] text-center">
                      {peopleAffected}
                    </span>
                    <button
                      onClick={() => setPeopleAffected(peopleAffected + 1)}
                      className="w-10 h-10 rounded-xl border border-[#E1E7ED] bg-white flex items-center justify-center text-lg font-bold text-[#18212B] active:scale-90 transition shadow-2xs"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Situation details textarea */}
                <div className="mt-5">
                  <label className="text-xs font-bold text-[#18212B]">
                    Situation details <span className="text-[#687789] font-normal">(optional)</span>
                  </label>
                  <div className="relative mt-1.5">
                    <textarea
                      rows={3}
                      maxLength={250}
                      value={situationDetails}
                      onChange={(e) => setSituationDetails(e.target.value)}
                      placeholder="Describe what is happening..."
                      className="w-full p-3 rounded-2xl border border-[#E1E7ED] bg-[#F8FAFC] text-xs text-[#18212B] focus:outline-none focus:border-[#FF5A24] resize-none"
                    />
                    <span className="absolute bottom-2.5 right-3 text-[10px] text-[#687789] font-mono">
                      {situationDetails.length} / 250
                    </span>
                  </div>
                </div>

                {/* Additional checkboxes */}
                <div className="mt-4 space-y-2.5">
                  <label className="text-xs font-bold text-[#18212B]">
                    Additional information <span className="text-[#687789] font-normal">(optional)</span>
                  </label>

                  {/* Checkbox 1 */}
                  <label className="flex items-center gap-2.5 text-xs text-[#18212B] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasMedicalHelp}
                      onChange={(e) => setHasMedicalHelp(e.target.checked)}
                      className="w-4 h-4 accent-[#FF5A24] rounded"
                    />
                    <span>Injured / Medical help needed</span>
                  </label>

                  {/* Checkbox 2 */}
                  <label className="flex items-center gap-2.5 text-xs text-[#18212B] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasElderlyOrDisabled}
                      onChange={(e) => setHasElderlyOrDisabled(e.target.checked)}
                      className="w-4 h-4 accent-[#FF5A24] rounded"
                    />
                    <span>Elderly / Person with disability</span>
                  </label>
                </div>
                {/* Submission Error Banner if any */}
                {submitError && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-left text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Transmission Failed</div>
                      <div className="text-[11px] mt-0.5">{submitError}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Submit SOS Action */}
              <div className="pt-4">
                <button
                  disabled={isSubmitting}
                  onClick={handleFinalSOSSubmit}
                  className="w-full py-3.5 rounded-2xl bg-[#FF5A24] hover:bg-[#E04D1B] disabled:opacity-50 active:scale-98 text-white font-bold text-sm shadow-md shadow-orange-500/20 transition flex items-center justify-center gap-2"
                >
                  <span>{isSubmitting ? 'Transmitting to SEOC...' : 'Next →'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 5: SOS CONFIRMATION - REQUEST SUBMITTED */}
          {/* ============================================================== */}
          {currentView === 'sos_submitted' && (
            <div className="flex-1 px-5 py-6 flex flex-col justify-between items-center text-center">
              <div className="w-full flex flex-col items-center">
                {/* Big Green Success Check Circle */}
                <div className="w-16 h-16 rounded-full bg-[#E8F8F2] border-2 border-[#16865D] flex items-center justify-center text-[#16865D] my-3 shadow-sm">
                  <Check className="w-9 h-9 stroke-[3]" />
                </div>

                <h2 className="text-xl font-black text-[#18212B] mt-1">
                  Request Submitted
                </h2>
                <p className="text-xs font-bold text-[#16865D] mt-0.5">
                  Help is on the way
                </p>

                {/* ID & ETA Summary Card */}
                <div className="w-full mt-5 p-3.5 bg-[#F8FAFC] rounded-2xl border border-[#E1E7ED] flex justify-between items-center text-left">
                  <div>
                    <div className="text-[11px] text-[#687789]">Incident ID</div>
                    <div className="text-sm font-black text-[#18212B] font-mono mt-0.5">{activeTrackingData.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-[#687789]">Estimated Response</div>
                    <div className="text-sm font-black text-[#FF5A24] mt-0.5">{activeTrackingData.eta}</div>
                  </div>
                </div>

                {/* Step Progress Checklist */}
                <div className="w-full mt-6 space-y-3.5 text-left pl-3 pr-2">
                  {activeTrackingData.timeline.map((item, idx) => (
                    <div key={item.step} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center ${item.done
                            ? 'bg-[#16865D] text-white'
                            : 'bg-white border-2 border-[#CBD5E1]'
                          }`}>
                          {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className={`font-semibold ${item.active ? 'text-[#16865D] font-bold' : item.done ? 'text-[#18212B]' : 'text-[#687789]'}`}>
                          {item.step}
                        </span>
                      </div>
                      <span className="text-[11px] font-mono text-[#687789]">{item.time}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button: Track Details -> Goes to Screen 6 */}
              <div className="w-full pt-4">
                <button
                  onClick={() => setCurrentView('sos_tracking')}
                  className="w-full py-3.5 rounded-2xl bg-white border border-[#E1E7ED] hover:bg-[#F8FAFC] active:scale-98 text-xs font-bold text-[#18212B] shadow-2xs transition flex items-center justify-center gap-2"
                >
                  <span>Track Details</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SCREEN 6: SOS TRACKING PAGE */}
          {/* ============================================================== */}
          {currentView === 'sos_tracking' && (
            <div className="flex-1 px-5 py-4 flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                {/* Header with Back to Home */}
                <div className="flex items-center justify-between pb-2 border-b border-[#E1E7ED]">
                  <button
                    onClick={() => {
                      setCurrentView('tab');
                      setActiveTab('home');
                    }}
                    className="p-1 -ml-1 text-[#18212B] hover:text-[#FF5A24] transition"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-sm font-bold text-[#18212B] font-mono">
                    Incident {activeTrackingData.id}
                  </h2>
                  <div className="w-5" />
                </div>

                {/* Status Hero Card */}
                <div className="p-4 rounded-2xl bg-[#FFF2EC] border border-[#FF5A24]/30 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FF5A24] text-white flex items-center justify-center text-lg shrink-0 shadow-xs">
                    🚒
                  </div>
                  <div>
                    <div className="text-sm font-black text-[#16865D]">{activeTrackingData.status}</div>
                    <p className="text-xs text-[#687789] mt-0.5 leading-snug">
                      Rescue team is on the way to your location.
                    </p>
                  </div>
                </div>

                {/* Tracking Metrics List */}
                <div className="space-y-2.5 text-xs">
                  <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[#18212B]">
                      <MapPin className="w-4 h-4 text-[#FF5A24]" />
                      <span className="font-semibold">{activeTrackingData.location}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[#94A3B8]" />
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between">
                    <span className="text-[#687789]">Assigned Team</span>
                    <span className="font-bold text-[#18212B]">{activeTrackingData.team}</span>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between">
                    <span className="text-[#687789]">Estimated Arrival</span>
                    <span className="font-bold text-[#FF5A24]">{activeTrackingData.eta}</span>
                  </div>
                </div>

                {/* Response Timeline Milestone Checklist */}
                <div className="pt-2">
                  <h4 className="text-xs font-bold text-[#18212B] uppercase tracking-wider mb-3">
                    Response Timeline
                  </h4>
                  <div className="space-y-3 pl-2 pr-2">
                    {activeTrackingData.timeline.map((item) => (
                      <div key={item.step} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${item.done
                              ? 'bg-[#16865D] text-white'
                              : 'bg-white border-2 border-[#CBD5E1]'
                            }`}>
                            {item.done && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span className={`font-semibold ${item.active ? 'text-[#16865D] font-bold' : item.done ? 'text-[#18212B]' : 'text-[#687789]'}`}>
                            {item.step}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#687789]">{item.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Helplines / Return action */}
              <div className="pt-4 space-y-2">
                <button
                  onClick={() => alert("Connecting to SEOC Emergency Dispatch Dispatcher...")}
                  className="w-full py-3 rounded-2xl bg-[#D93636] hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call Emergency Dispatch (112)</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 2: SAFETY MAP (activeTab === 'map' && currentView === 'tab') */}
          {/* ============================================================== */}
          {activeTab === 'map' && currentView === 'tab' && (
            <div className="flex-1 flex flex-col h-full relative">
              {/* Map Header */}
              <div className="p-3 bg-white border-b border-[#E1E7ED] flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-orange-50 flex items-center justify-center text-[#FF5A24]">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#18212B]">Mysuru Safety Map</h3>
                    <p className="text-[10px] text-[#687789]">Verified shelters & warnings</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[#16865D] bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#16865D] animate-pulse" />
                  <span>GPS Active</span>
                </div>
              </div>

              {/* MapLibre Container */}
              <div ref={mapContainerRef} className="flex-1 w-full h-full min-h-[300px]" />

              {/* Map Overlay Filter Pill Strip */}
              <div className="absolute bottom-3 left-3 right-3 bg-white/95 backdrop-blur-xs p-2.5 rounded-2xl border border-[#E1E7ED] shadow-md z-10 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-[#18212B] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#FF5A24]" /> You
                  </span>
                  <span className="flex items-center gap-1 text-[#18212B] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#16865D]" /> Shelter
                  </span>
                  <span className="flex items-center gap-1 text-[#18212B] font-medium">
                    <span className="w-2 h-2 rounded-full bg-[#4386C6]" /> Hospital
                  </span>
                </div>
                <span className="text-[10px] text-[#687789] font-mono">SEOC Map</span>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 3: UPDATES & ACTIVE ALERTS */}
          {/* ============================================================== */}
          {activeTab === 'updates' && currentView === 'tab' && (
            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4">
              <div className="border-b border-[#E1E7ED] pb-2">
                <h2 className="text-base font-bold text-[#18212B]">Disaster Updates & Alerts</h2>
                <p className="text-xs text-[#687789]">Verified advisories from state response network</p>
              </div>

              {/* Active User SOS Tracking Shortcut */}
              <div
                onClick={() => setCurrentView('sos_tracking')}
                className="p-3.5 rounded-2xl bg-[#FFF2EC] border border-[#FF5A24]/40 hover:bg-[#FFE8DE] transition cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FF5A24] text-white flex items-center justify-center text-xs font-bold">
                    SOS
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#18212B]">Active SOS: {activeTrackingData.id}</div>
                    <div className="text-[11px] text-[#16865D] font-semibold">{activeTrackingData.status} • ETA {activeTrackingData.eta}</div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#FF5A24]" />
              </div>

              {/* Broadcast Alerts Stream */}
              <div className="space-y-3">
                {state?.alerts && state.alerts.length > 0 ? (
                  state.alerts.map((al) => {
                    const isCrit = al.severity === 'Critical';
                    return (
                      <div key={al.id} className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${isCrit ? 'bg-red-50 text-[#D93636] border-red-200' : 'bg-amber-50 text-[#D97706] border-amber-200'
                            }`}>
                            {al.severity.toUpperCase()}
                          </span>
                          <span className="text-[10px] text-[#687789] font-mono">SEOC</span>
                        </div>
                        <h3 className="text-xs font-bold text-[#18212B]">{al.title}</h3>
                        <p className="text-xs text-[#687789] leading-snug">{al.description}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full bg-red-50 text-[#D93636] border border-red-200 text-[10px] font-bold">
                        URGENT WARNING
                      </span>
                      <span className="text-[10px] text-[#687789] font-mono">18:00 IST</span>
                    </div>
                    <h3 className="text-xs font-bold text-[#18212B]">Kukkarahalli Lake Canal Overflow</h3>
                    <p className="text-xs text-[#687789] leading-snug">
                      Ground-level residences in Saraswathipuram and Vijayanagar advised to seek higher ground.
                    </p>
                  </div>
                )}

                {/* Dynamic Shelters List */}
                {state?.shelters && state.shelters.map((sh) => (
                  <div key={sh.id} className="p-3.5 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-[#16865D] border border-emerald-200 text-[10px] font-bold">
                        SHELTER {sh.operational_status.toUpperCase()}
                      </span>
                      <span className="text-[10px] text-[#16865D] font-mono font-semibold">{sh.current_occupancy}/{sh.capacity} Occupied</span>
                    </div>
                    <h3 className="text-xs font-bold text-[#18212B]">{sh.name}</h3>
                    <p className="text-xs text-[#687789] leading-snug">
                      {sh.address}. Relief supplies: {sh.supplies_status}.
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* TAB 4: PROFILE & EMERGENCY SETTINGS */}
          {/* ============================================================== */}
          {activeTab === 'profile' && currentView === 'tab' && (
            <div className="flex-1 px-5 py-4 overflow-y-auto space-y-4">
              <div className="border-b border-[#E1E7ED] pb-2">
                <h2 className="text-base font-bold text-[#18212B]">My Emergency Profile</h2>
                <p className="text-xs text-[#687789]">Essential contacts and medical details</p>
              </div>

              {/* Personal Card */}
              <div className="p-4 bg-white border border-[#E1E7ED] rounded-2xl shadow-2xs flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center text-[#FF5A24] font-bold text-lg">
                  JD
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#18212B]">John Doe</h3>
                  <p className="text-xs text-[#687789] font-mono">+91 98765 43210</p>
                  <span className="text-[10px] text-[#16865D] font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-1 inline-block">
                    Mysuru Resident
                  </span>
                </div>
              </div>

              {/* Emergency Contacts */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#18212B] uppercase tracking-wider">
                  Trusted Emergency Contacts
                </h4>

                <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-[#18212B]">Sarah Doe (Spouse)</div>
                    <div className="text-[#687789] font-mono text-[11px]">+91 98450 11223</div>
                  </div>
                  <button className="p-2 rounded-full bg-emerald-50 text-[#16865D]">
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-[#18212B]">Dr. Ramesh (Family Physician)</div>
                    <div className="text-[#687789] font-mono text-[11px]">+91 98860 33445</div>
                  </div>
                  <button className="p-2 rounded-full bg-emerald-50 text-[#16865D]">
                    <Phone className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* System & Permissions */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-[#18212B] uppercase tracking-wider">
                  Device Readiness
                </h4>

                <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between text-xs">
                  <span className="text-[#18212B] font-medium">GPS Location Services</span>
                  <span className="font-bold text-[#16865D]">Granted (High Accuracy)</span>
                </div>

                <div className="p-3 bg-white rounded-xl border border-[#E1E7ED] flex items-center justify-between text-xs">
                  <span className="text-[#18212B] font-medium">Emergency Broadcast Push</span>
                  <span className="font-bold text-[#16865D]">Enabled</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 3. PERSISTENT NATIVE BOTTOM NAVIGATION BAR (Home, Map, Updates, Profile) */}
        <div className="h-16 border-t border-[#E1E7ED] bg-white px-6 flex items-center justify-between shrink-0 z-20 shadow-md">
          {/* Home Tab */}
          <button
            onClick={() => {
              setActiveTab('home');
              setCurrentView('tab');
            }}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'home' && currentView === 'tab'
                ? 'text-[#FF5A24] font-bold'
                : 'text-[#687789] hover:text-[#18212B]'
              }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] leading-none">Home</span>
          </button>

          {/* Map Tab */}
          <button
            onClick={() => {
              setActiveTab('map');
              setCurrentView('tab');
            }}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'map' && currentView === 'tab'
                ? 'text-[#FF5A24] font-bold'
                : 'text-[#687789] hover:text-[#18212B]'
              }`}
          >
            <MapIcon className="w-5 h-5" />
            <span className="text-[10px] leading-none">Map</span>
          </button>

          {/* Updates Tab */}
          <button
            onClick={() => {
              setActiveTab('updates');
              setCurrentView('tab');
            }}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'updates' && currentView === 'tab'
                ? 'text-[#FF5A24] font-bold'
                : 'text-[#687789] hover:text-[#18212B]'
              }`}
          >
            <Bell className="w-5 h-5" />
            <span className="text-[10px] leading-none">Updates</span>
          </button>

          {/* Profile Tab */}
          <button
            onClick={() => {
              setActiveTab('profile');
              setCurrentView('tab');
            }}
            className={`flex flex-col items-center gap-1 transition ${activeTab === 'profile' && currentView === 'tab'
                ? 'text-[#FF5A24] font-bold'
                : 'text-[#687789] hover:text-[#18212B]'
              }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] leading-none">Profile</span>
          </button>
        </div>

        {/* 4. HOME INDICATOR PILL (Modern mobile viewport) */}
        <div className="w-32 h-1 bg-black/30 rounded-full mx-auto mb-1 shrink-0" />

      </div>

    </div>
  );
};

export default CitizenApp;
