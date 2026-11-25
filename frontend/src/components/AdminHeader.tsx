import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Clock, 
  CloudSun, 
  ShieldAlert, 
  Bell, 
  User, 
  Activity,
  ChevronDown
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';

export const AdminHeader: React.FC = () => {
  const { state, openData, fetchOpenData, isOffline, syncLatencyMs, lastSyncedAt } = useAtlasStore();
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
      <div className="flex items-center gap-3.5 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-white">
          <MapPin className="w-3.5 h-3.5 text-[#E85D2A]" />
          <span className="font-bold tracking-tight">ATLAS COMMAND</span>
          <span className="text-slate-400 text-[11px] font-mono hidden sm:inline">Mysuru (12.2958°N, 76.6394°E)</span>
        </div>

        <span className="h-3.5 w-[1px] bg-slate-700" />

        {/* Date & Time */}
        <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] tabular-nums">
          <Clock className="w-3 h-3 text-slate-400" />
          <span className="hidden lg:inline">{currentDate}</span>
          <span className="hidden lg:inline">•</span>
          <span className="font-semibold text-slate-100">{currentTime || '--:--:-- IST'}</span>
        </div>

        <span className="h-3.5 w-[1px] bg-slate-700 hidden md:block" />

        {/* Live Open-Meteo Weather */}
        <div className="hidden md:flex items-center gap-1.5 text-slate-300 text-[11px]" title={weather?.attribution || 'Open-Meteo'}>
          <CloudSun className="w-3.5 h-3.5 text-sky-400" />
          {weather?.available ? (
            <span className="tabular-nums">
              {weather.temperature_c}°C {weather.condition} • Wind {weather.wind_speed_kmh} km/h
              <span className="ml-1.5 text-[9px] font-mono text-slate-400">[Open-Meteo]</span>
            </span>
          ) : (
            <span className="text-slate-400 font-mono text-[10px]">Weather: Unavailable</span>
          )}
        </div>
      </div>

      {/* Right: Connectivity Freshness, Threat Level, Alerts */}
      <div className="flex items-center gap-3 text-xs">
        {/* Data Freshness & Connectivity */}
        <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[10px] border ${
          isOffline
            ? 'bg-red-950/60 text-red-300 border-red-700/60'
            : 'bg-slate-800/80 text-emerald-300 border-slate-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? 'bg-red-400' : 'bg-emerald-400 animate-pulse'}`} />
          <span>{isOffline ? 'Degraded • Retrying' : `Synced${syncLatencyMs ? ` (${syncLatencyMs}ms)` : ''}`}</span>
        </div>

        {/* Threat Level Badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-mono font-bold text-slate-400 hidden sm:inline">Threat:</span>
          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border flex items-center gap-1 ${threatColorClass}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {threatLevel}
          </span>
        </div>

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

        <span className="h-3.5 w-[1px] bg-[#E5E9ED]" />

        {/* Admin Profile */}
        <div className="flex items-center gap-2 pl-1 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-[#F5F6F7] border border-[#E5E9ED] flex items-center justify-center text-[#18212B] font-semibold text-xs">
            <User className="w-3.5 h-3.5 text-[#718096]" />
          </div>
          <div className="hidden lg:block text-left leading-tight">
            <div className="font-semibold text-xs text-[#18212B]">Incident Commander</div>
            <div className="text-[10px] text-[#718096] font-mono">SEOC • Operations</div>
          </div>
        </div>
      </div>
    </header>
  );
};
