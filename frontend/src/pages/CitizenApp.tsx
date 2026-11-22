import React, { useState } from 'react';
import { 
  AlertOctagon, 
  MapPin, 
  PhoneCall, 
  Send, 
  Users, 
  CheckCircle, 
  Radio, 
  ShieldAlert, 
  Bell,
  Navigation,
  ArrowRight,
  Shield,
  LifeBuoy,
  FileQuestion,
  Home,
  AlertTriangle,
  User,
  HeartPulse,
  Activity,
  ChevronRight
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';

export const CitizenApp: React.FC = () => {
  const { state, submitSOS } = useAtlasStore();

  // Screen state: 1 = Home, 2 = SOS Request flow, 3 = Request Submitted
  const [currentScreen, setCurrentScreen] = useState<1 | 2 | 3>(1);
  const [bottomNav, setBottomNav] = useState<'home' | 'shelters' | 'alerts' | 'profile'>('home');

  // Emergency Form State
  const [selectedEmergency, setSelectedEmergency] = useState('Flooding');
  const [affectedPeople, setAffectedPeople] = useState(2);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedIncidentId, setSubmittedIncidentId] = useState('INC-1043');

  // Mysuru default coordinates for citizen
  const citizenLat = 12.3180;
  const citizenLon = 76.6430;

  const emergencyOptions = [
    { id: 'Flooding', label: 'Flooding', icon: '🌊' },
    { id: 'Medical Emergency', label: 'Medical Emergency', icon: '➕' },
    { id: 'Trapped / Need Rescue', label: 'Trapped / Need Rescue', icon: '🆘' },
    { id: 'Road Blockage', label: 'Road Blockage', icon: '⚠️' },
    { id: 'Other', label: 'Other', icon: '💬' }
  ];

  const handleNextSOS = async () => {
    setIsSubmitting(true);
    try {
      const inc = await submitSOS({
        type: selectedEmergency,
        description: `Citizen SOS in Vijayanagar area: ${selectedEmergency}. ${affectedPeople} people reported.`,
        latitude: citizenLat,
        longitude: citizenLon,
        affected_population: affectedPeople
      });
      if (inc && inc.id) {
        setSubmittedIncidentId(inc.id);
      }
      setCurrentScreen(3);
    } catch (e) {
      // Fallback ID if network delay
      setSubmittedIncidentId('INC-1043');
      setCurrentScreen(3);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] py-8 px-4 flex flex-col items-center justify-center font-sans">
      
      {/* Device Frame Header / Simulation Switcher info */}
      <div className="mb-4 text-center max-w-sm">
        <div className="text-xs font-semibold text-[#64748B] tracking-wide uppercase">
          ATLAS Civilian Mobile Experience
        </div>
        <div className="text-[11px] text-[#64748B]/80">
          Official Emergency Application (Mysuru Response Network)
        </div>
      </div>

      {/* 3-DEVICE CAROUSEL / TRIPLE SCREEN SHOWCASE or ACTIVE DEVICE CONTAINER */}
      <div className="flex flex-wrap items-center justify-center gap-6">

        {/* SCREEN 1: HOME */}
        <div className={`w-[320px] h-[640px] bg-white rounded-[40px] border-[8px] border-[#17212B] shadow-2xl flex flex-col justify-between overflow-hidden relative transition-all duration-300 ${currentScreen === 1 ? 'ring-4 ring-[#F26536]/30 shadow-orange-100 scale-102' : 'opacity-85 hover:opacity-100'}`}>
          {/* Top Notch & Status Bar */}
          <div className="pt-3 px-6 flex justify-between items-center text-[11px] font-semibold text-[#17212B]">
            <span>9:41</span>
            <div className="w-16 h-4 bg-[#17212B] rounded-full mx-auto -mt-1"></div>
            <div className="flex items-center gap-1">
              <span className="text-[9px]">5G</span>
              <div className="w-3.5 h-2 border border-[#17212B] rounded-xs p-0.5">
                <div className="w-full h-full bg-[#17212B]"></div>
              </div>
            </div>
          </div>

          {/* App Header */}
          <div className="px-5 pt-3 pb-2 flex items-center justify-center gap-1.5 border-b border-[#F5F7F9]">
            <div className="w-5 h-5 rounded bg-[#F26536] flex items-center justify-center text-white text-[10px] font-black">
              ▲
            </div>
            <span className="text-xs font-black tracking-wider text-[#17212B]">ATLAS</span>
          </div>

          {/* Main Body */}
          <div className="flex-1 px-5 py-4 flex flex-col justify-between overflow-y-auto">
            {/* Title Hero */}
            <div>
              <h1 className="text-xl font-black text-[#17212B] leading-tight">
                Stay Safe<br />Mysuru
              </h1>
              <p className="text-[11px] text-[#64748B] mt-1 leading-snug">
                Report, get help, and stay updated during emergencies.
              </p>
            </div>

            {/* Primary SOS Action Button */}
            <div className="my-3">
              <button
                onClick={() => setCurrentScreen(2)}
                className="w-full py-4 bg-[#F26536] hover:bg-[#E05322] active:scale-98 rounded-2xl text-white font-bold shadow-lg shadow-orange-500/30 flex flex-col items-center justify-center gap-0.5 transition"
              >
                <div className="flex items-center gap-1.5 text-base">
                  <span className="text-lg">🚨</span>
                  <span>SOS</span>
                </div>
                <span className="text-[11px] font-medium opacity-90">Request Immediate Help</span>
              </button>
            </div>

            {/* Secondary 2x2 Action Tiles */}
            <div className="grid grid-cols-2 gap-2.5 my-1">
              <button 
                onClick={() => setCurrentScreen(2)}
                className="p-3 bg-[#F5F7F9] hover:bg-orange-50 border border-[#E3E8ED] rounded-xl flex flex-col items-center text-center gap-1 transition"
              >
                <div className="text-base text-[#F26536]">📍</div>
                <span className="text-[10px] font-bold text-[#17212B]">Report an Incident</span>
              </button>

              <button 
                onClick={() => alert("Mysuru Weather Advisory: Heavy rain expected over next 3 hours. Avoid low-lying culverts.")}
                className="p-3 bg-[#F5F7F9] hover:bg-orange-50 border border-[#E3E8ED] rounded-xl flex flex-col items-center text-center gap-1 transition"
              >
                <div className="text-base text-[#3985C6]">📈</div>
                <span className="text-[10px] font-bold text-[#17212B]">Check Updates</span>
              </button>

              <button 
                onClick={() => alert("Active Shelters: 1. VVCE Campus Auditorium (Capacity: 450) | 2. Maharaja College Ground (Capacity: 600)")}
                className="p-3 bg-[#F5F7F9] hover:bg-orange-50 border border-[#E3E8ED] rounded-xl flex flex-col items-center text-center gap-1 transition"
              >
                <div className="text-base text-[#23966B]">🏠</div>
                <span className="text-[10px] font-bold text-[#17212B]">Nearby Shelters</span>
              </button>

              <button 
                onClick={() => alert("Emergency Helplines:\nPolice: 112\nFire: 101\nAmbulance: 108\nMysuru Disaster Cell: 0821-2423800")}
                className="p-3 bg-[#F5F7F9] hover:bg-orange-50 border border-[#E3E8ED] rounded-xl flex flex-col items-center text-center gap-1 transition"
              >
                <div className="text-base text-[#E23B3B]">📞</div>
                <span className="text-[10px] font-bold text-[#17212B]">Emergency Contacts</span>
              </button>
            </div>
          </div>

          {/* Bottom Navigation Bar */}
          <div className="px-6 py-2.5 border-t border-[#E3E8ED] bg-white flex justify-between items-center text-[10px] text-[#64748B]">
            <button onClick={() => { setCurrentScreen(1); setBottomNav('home'); }} className={`flex flex-col items-center ${bottomNav === 'home' ? 'text-[#F26536] font-bold' : ''}`}>
              <Home className="w-4 h-4" />
            </button>
            <button onClick={() => setBottomNav('shelters')} className={`flex flex-col items-center ${bottomNav === 'shelters' ? 'text-[#F26536] font-bold' : ''}`}>
              <MapPin className="w-4 h-4" />
            </button>
            <button onClick={() => setBottomNav('alerts')} className={`flex flex-col items-center ${bottomNav === 'alerts' ? 'text-[#F26536] font-bold' : ''}`}>
              <Bell className="w-4 h-4" />
            </button>
            <button onClick={() => setBottomNav('profile')} className={`flex flex-col items-center ${bottomNav === 'profile' ? 'text-[#F26536] font-bold' : ''}`}>
              <User className="w-4 h-4" />
            </button>
          </div>
          
          {/* Home Indicator */}
          <div className="w-28 h-1 bg-black/40 rounded-full mx-auto mb-1.5"></div>
        </div>


        {/* SCREEN 2: SOS REQUEST (1/3) */}
        <div className={`w-[320px] h-[640px] bg-white rounded-[40px] border-[8px] border-[#17212B] shadow-2xl flex flex-col justify-between overflow-hidden relative transition-all duration-300 ${currentScreen === 2 ? 'ring-4 ring-[#F26536]/30 shadow-orange-100 scale-102' : 'opacity-85 hover:opacity-100'}`}>
          {/* Status Bar */}
          <div className="pt-3 px-6 flex justify-between items-center text-[11px] font-semibold text-[#17212B]">
            <span>9:41</span>
            <div className="w-16 h-4 bg-[#17212B] rounded-full mx-auto -mt-1"></div>
            <div className="flex items-center gap-1">
              <span className="text-[9px]">5G</span>
              <div className="w-3.5 h-2 border border-[#17212B] rounded-xs p-0.5">
                <div className="w-full h-full bg-[#17212B]"></div>
              </div>
            </div>
          </div>

          {/* Nav Header */}
          <div className="px-4 py-2 border-b border-[#F5F7F9] flex items-center justify-between">
            <button onClick={() => setCurrentScreen(1)} className="text-[#64748B] hover:text-[#17212B] text-xs font-semibold">
              ←
            </button>
            <h2 className="text-xs font-bold text-[#17212B]">SOS Request</h2>
            <span className="text-[10px] text-[#64748B] font-mono">1/3</span>
          </div>

          {/* Form Content */}
          <div className="flex-1 px-5 py-4 flex flex-col justify-between overflow-y-auto">
            <div>
              <h3 className="text-sm font-bold text-[#17212B] mb-3">
                What's the Emergency?
              </h3>

              {/* Options List */}
              <div className="space-y-2">
                {emergencyOptions.map((opt) => {
                  const isSelected = selectedEmergency === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelectedEmergency(opt.id)}
                      className={`w-full p-2.5 rounded-xl border flex items-center justify-between transition text-left ${
                        isSelected 
                          ? 'border-[#F26536] bg-[#F26536]/5 text-[#F26536]' 
                          : 'border-[#E3E8ED] bg-[#F5F7F9]/40 text-[#17212B] hover:bg-[#F5F7F9]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm">{opt.icon}</span>
                        <span className={`text-xs font-semibold ${isSelected ? 'text-[#F26536]' : 'text-[#17212B]'}`}>
                          {opt.label}
                        </span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        isSelected ? 'border-[#F26536] bg-[#F26536]' : 'border-[#CBD5E1]'
                      }`}>
                        {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Location Tag */}
              <div className="mt-4 p-2.5 bg-[#F5F7F9] rounded-xl border border-[#E3E8ED] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 text-[#F26536]" />
                  <div className="text-[11px] font-medium text-[#17212B]">
                    Vijayanagar, Mysuru
                  </div>
                </div>
                <span className="text-[9px] font-mono text-[#23966B] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  GPS Fixed
                </span>
              </div>
            </div>

            {/* Next Action Button */}
            <div className="pt-2">
              <button
                disabled={isSubmitting}
                onClick={handleNextSOS}
                className="w-full py-3 bg-[#F26536] hover:bg-[#E05322] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition"
              >
                <span>{isSubmitting ? 'Transmitting...' : 'Next →'}</span>
              </button>
            </div>
          </div>

          {/* Home Indicator */}
          <div className="w-28 h-1 bg-black/40 rounded-full mx-auto mb-2"></div>
        </div>


        {/* SCREEN 3: REQUEST SUBMITTED & TRACKING */}
        <div className={`w-[320px] h-[640px] bg-white rounded-[40px] border-[8px] border-[#17212B] shadow-2xl flex flex-col justify-between overflow-hidden relative transition-all duration-300 ${currentScreen === 3 ? 'ring-4 ring-[#23966B]/30 shadow-emerald-100 scale-102' : 'opacity-85 hover:opacity-100'}`}>
          {/* Status Bar */}
          <div className="pt-3 px-6 flex justify-between items-center text-[11px] font-semibold text-[#17212B]">
            <span>9:41</span>
            <div className="w-16 h-4 bg-[#17212B] rounded-full mx-auto -mt-1"></div>
            <div className="flex items-center gap-1">
              <span className="text-[9px]">5G</span>
              <div className="w-3.5 h-2 border border-[#17212B] rounded-xs p-0.5">
                <div className="w-full h-full bg-[#17212B]"></div>
              </div>
            </div>
          </div>

          {/* Main Confirmation Content */}
          <div className="flex-1 px-5 py-5 flex flex-col justify-between overflow-y-auto">
            <div className="flex flex-col items-center text-center">
              {/* Green Check Icon Circle */}
              <div className="w-14 h-14 rounded-full bg-[#23966B]/15 border-2 border-[#23966B] flex items-center justify-center text-[#23966B] my-2 shadow-sm">
                <CheckCircle className="w-8 h-8 text-[#23966B]" />
              </div>

              <h2 className="text-base font-bold text-[#17212B] mt-1">
                Request Submitted
              </h2>
              <p className="text-xs font-semibold text-[#23966B] mt-0.5">
                Help is on the way
              </p>

              {/* ID & ETA Banner */}
              <div className="w-full mt-4 p-3 bg-[#F5F7F9] rounded-xl border border-[#E3E8ED] flex justify-between items-center text-left">
                <div>
                  <div className="text-[10px] text-[#64748B]">Incident ID</div>
                  <div className="text-xs font-bold text-[#17212B] font-mono">{submittedIncidentId}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[#64748B]">Estimated Response</div>
                  <div className="text-xs font-bold text-[#F26536]">~ 7 min</div>
                </div>
              </div>

              {/* Progress Steps Timeline */}
              <div className="w-full mt-5 relative pl-6 text-left before:absolute before:left-[9px] before:top-2 before:bottom-2 before:w-[2px] before:bg-[#E3E8ED]">
                
                {/* Step 1 */}
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="absolute -left-6 w-2.5 h-2.5 rounded-full bg-[#23966B] ring-2 ring-white"></div>
                  <span className="text-xs font-medium text-[#17212B]">Request Received</span>
                  <span className="text-[10px] font-mono text-[#64748B]">18:01</span>
                </div>

                {/* Step 2 */}
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="absolute -left-6 w-2.5 h-2.5 rounded-full bg-[#23966B] ring-2 ring-white"></div>
                  <span className="text-xs font-medium text-[#17212B]">Rescue Team Assigned</span>
                  <span className="text-[10px] font-mono text-[#64748B]">18:03</span>
                </div>

                {/* Step 3 (Active) */}
                <div className="relative mb-3 flex items-center justify-between">
                  <div className="absolute -left-6 w-2.5 h-2.5 rounded-full bg-[#23966B] ring-2 ring-white animate-pulse"></div>
                  <span className="text-xs font-bold text-[#23966B]">En Route</span>
                  <span className="text-[10px] font-mono text-[#23966B] font-semibold">18:05</span>
                </div>

                {/* Step 4 (Pending) */}
                <div className="relative flex items-center justify-between">
                  <div className="absolute -left-6 w-2.5 h-2.5 rounded-full bg-[#CBD5E1] ring-2 ring-white"></div>
                  <span className="text-xs text-[#64748B]">On Site</span>
                  <span className="text-[10px] font-mono text-[#64748B]">--</span>
                </div>

              </div>
            </div>

            {/* Back to Home / Call Help */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => setCurrentScreen(1)}
                className="w-full py-2.5 border border-[#E3E8ED] bg-[#F5F7F9] hover:bg-[#E3E8ED] rounded-xl text-xs font-semibold text-[#17212B] transition"
              >
                Back to Home
              </button>
            </div>
          </div>

          {/* Home Indicator */}
          <div className="w-28 h-1 bg-black/40 rounded-full mx-auto mb-2"></div>
        </div>

      </div>

    </div>
  );
};
