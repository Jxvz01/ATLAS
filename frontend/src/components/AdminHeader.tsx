import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { 
  MapPin, 
  Clock, 
  CloudSun, 
  Bell, 
  User, 
  Menu,
  Users,
  Building2,
  BarChart2,
  Radio,
  Play,
  ShieldCheck,
  RadioTower,
  Smartphone,
  LogOut
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { useAuthStore } from '../store/authStore';

interface AdminHeaderProps {
  activeNav?: string;
  onOpenView?: (tab: string) => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ activeNav = 'command-center', onOpenView }) => {
  const { state, openData, fetchOpenData, isOffline, syncLatencyMs } = useAtlasStore();
  const { logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    fetchOpenData(false);
    const odTimer = setInterval(() => fetchOpenData(false), 300000);
    return () => clearInterval(odTimer);
  }, [fetchOpenData]);

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date();
      // e.g. "16:35:10 IST"
      setCurrentTime(now.toLocaleTimeString('en-IN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST');
      // e.g. "22 Nov 2026"
      setCurrentDate(now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }));
    };
    updateDateTime();
    const interval = setInterval(updateDateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Compute threat level deterministically based on active & critical incidents
  const activeCount = (state?.incidents || []).filter(i => i.status !== 'Resolved').length;
  const criticalCount = (state?.incidents || []).filter(i => i.priority_level === 'Critical' && i.status !== 'Resolved').length;

  let threatLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' = 'LOW';
  let threatColorClass = 'text-[#27966B] bg-[#27966B]/10 border-[#27966B]/30';

  if (criticalCount >= 2 || activeCount >= 8) {
    threatLevel = 'SEVERE';
    threatColorClass = 'text-[#DC3C3C] bg-[#DC3C3C]/10 border-[#DC3C3C]/30';
  } else if (criticalCount >= 1 || activeCount >= 5) {
    threatLevel = 'HIGH';
    threatColorClass = 'text-[#F26A38] bg-[#F26A38]/10 border-[#F26A38]/30';
  } else if (activeCount >= 2) {
    threatLevel = 'MODERATE';
    threatColorClass = 'text-[#E6A23C] bg-[#E6A23C]/10 border-[#E6A23C]/30';
  }

  const unreadAlertsCount = (state?.alerts || []).length;
  const weather = openData?.weather;

  return (
    <header className="h-12 bg-[#0F172A] text-slate-100 border-b border-slate-800 px-4 flex items-center justify-between z-20 select-none">
      {/* Left: Operational Context & Coordinates */}
      <div className="flex items-center gap-3 text-xs shrink-0">
        <div className="flex items-center gap-2 font-medium text-white">
          <div className="w-6 h-6 rounded bg-[#E85D2A] text-white flex items-center justify-center font-black text-xs">
            ▲
          </div>
          <div>
            <div className="font-bold tracking-tight leading-none">ATLAS <span className="font-normal text-slate-400">| Command Center</span></div>
            <div className="text-[9px] text-slate-400 hidden sm:block">Disaster Response & Coordination</div>
          </div>
        </div>
      </div>

      {/* Center: Primary Command Navigation Tabs */}
      <nav className="hidden xl:flex items-center gap-1 text-[11px] font-semibold">
        {[
          { id: 'command-center', label: 'Operations', icon: MapPin },
          { id: 'hazard-intel', label: 'Intelligence (AI)', icon: ShieldCheck },
          { id: 'resources', label: 'Resources', icon: Users },
          { id: 'hospitals', label: 'Hospitals', icon: Building2 },
          { id: 'communications', label: 'Broadcasts', icon: Radio },
          { id: 'analytics', label: 'Reports', icon: BarChart2 },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeNav === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onOpenView && onOpenView(tab.id)}
              className={`px-2.5 py-1.5 rounded flex items-center gap-1.5 transition ${
                isActive
                  ? 'bg-[#E85D2A]/20 text-[#FF8A65] border border-[#E85D2A]/40'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right: Connectivity Freshness, Weather, Time & Operations Menu */}
      <div className="flex items-center gap-2.5 text-xs shrink-0">
        {/* Live Open-Meteo Weather */}
        <div className="hidden md:flex items-center gap-1 text-slate-300 text-[10px]" title={weather?.attribution || 'Open-Meteo'}>
          <CloudSun className="w-3.5 h-3.5 text-sky-400" />
          {weather?.available ? (
            <span className="tabular-nums">{weather.temperature_c}°C</span>
          ) : null}
        </div>

        {/* Data Freshness & Connectivity */}
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] border ${
          isOffline
            ? 'bg-red-950/60 text-red-300 border-red-700/60'
            : 'bg-slate-800/80 text-emerald-300 border-slate-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
          <span>{isOffline ? 'Degraded' : `Live Synced${syncLatencyMs ? ` (${syncLatencyMs}ms)` : ''}`}</span>
        </div>

        {/* Date & Time */}
        <div className="hidden lg:flex items-center gap-1.5 text-slate-300 font-mono text-[10px] tabular-nums">
          <span>{currentTime || '--:-- IST'}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">{currentDate}</span>
        </div>

        {/* Threat Level Badge */}
        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border flex items-center gap-1 ${threatColorClass}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
          {threatLevel}
        </span>

        <span className="h-3.5 w-[1px] bg-slate-700" />

        {/* Notification Bell */}
        <button 
          title="Active Notifications"
          className="relative p-1.5 rounded-md hover:bg-slate-800 text-slate-300 hover:text-white transition"
        >
          <Bell className="w-4 h-4" />
          {unreadAlertsCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#F26A38]" />
          )}
        </button>

        <span className="h-3.5 w-[1px] bg-slate-700" />

        {/* Secondary Views & Portals Menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 transition"
          >
            <Menu className="w-3.5 h-3.5 text-[#E85D2A]" />
            <span className="hidden sm:inline">Operations</span>
          </button>

          {menuOpen && (
            <div
              onMouseLeave={() => setMenuOpen(false)}
              className="absolute right-0 top-9 w-56 bg-white text-[#111827] border border-[#DCE2E8] rounded-lg shadow-xl py-1.5 z-50 text-xs"
            >
              <div className="px-3 py-1 text-[10px] font-mono font-bold uppercase text-[#5B6777]">
                Command Modules
              </div>
              {[
                { id: 'resources', label: 'Response Units', icon: Users },
                { id: 'hospitals', label: 'Hospital Capacity', icon: Building2 },
                { id: 'analytics', label: 'Metrics & Analytics', icon: BarChart2 },
                { id: 'communications', label: 'Broadcast Alerts', icon: Radio },
                { id: 'simulation', label: 'Simulation Controls', icon: Play },
                { id: 'access-control', label: 'Access Control', icon: ShieldCheck },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setMenuOpen(false);
                      if (onOpenView) onOpenView(item.id);
                    }}
                    className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-[#F3F5F8] text-left font-medium"
                  >
                    <Icon className="w-3.5 h-3.5 text-[#5B6777]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-[#DCE2E8]" />
              <div className="px-3 py-1 text-[10px] font-mono font-bold uppercase text-[#5B6777]">
                Portals
              </div>
              <NavLink to="/hospital" className="px-3 py-1.5 flex items-center gap-2 hover:bg-[#F3F5F8] text-[#111827]">
                <Building2 className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Hospital Portal</span>
              </NavLink>
              <NavLink to="/rescue" className="px-3 py-1.5 flex items-center gap-2 hover:bg-[#F3F5F8] text-[#111827]">
                <RadioTower className="w-3.5 h-3.5 text-[#15803D]" />
                <span>Rescuer Terminal</span>
              </NavLink>
              <NavLink to="/app" className="px-3 py-1.5 flex items-center gap-2 hover:bg-[#F3F5F8] text-[#111827]">
                <Smartphone className="w-3.5 h-3.5 text-[#E85D2A]" />
                <span>Civilian SOS App</span>
              </NavLink>

              <div className="my-1 border-t border-[#DCE2E8]" />
              <button
                onClick={logout}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-red-50 text-[#DC2626] font-semibold text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Admin Profile */}
        <div className="hidden xl:flex items-center gap-2 pl-1">
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-200 font-semibold text-xs">
            <User className="w-3.5 h-3.5 text-slate-300" />
          </div>
          <div className="text-left leading-tight">
            <div className="font-semibold text-[11px] text-slate-100">Commander</div>
            <div className="text-[9px] text-slate-400 font-mono">SEOC • Live</div>
          </div>
        </div>
      </div>
    </header>
  );
};
