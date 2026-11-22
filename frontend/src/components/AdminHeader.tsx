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
  const { state } = useAtlasStore();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');

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

  return (
    <header className="h-12 bg-white border-b border-[#E5E9ED] px-4 flex items-center justify-between z-20 select-none shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Left: Operational Context & Coordinates */}
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1.5 font-medium text-[#18212B]">
          <MapPin className="w-3.5 h-3.5 text-[#F26A38]" />
          <span className="font-semibold">Mysuru, Karnataka</span>
          <span className="text-[#718096] text-[11px] font-mono">(12.2958° N, 76.6394° E)</span>
        </div>

        <span className="h-3.5 w-[1px] bg-[#E5E9ED]" />

        {/* Date & Time */}
        <div className="flex items-center gap-2 text-[#718096] font-mono text-[11px]">
          <Clock className="w-3 h-3 text-[#718096]" />
          <span>{currentDate}</span>
          <span>•</span>
          <span className="font-semibold text-[#18212B]">{currentTime || '16:30 IST'}</span>
        </div>

        <span className="h-3.5 w-[1px] bg-[#E5E9ED] hidden md:block" />

        {/* Weather condition */}
        <div className="hidden md:flex items-center gap-1.5 text-[#718096] text-xs">
          <CloudSun className="w-3.5 h-3.5 text-[#4386C6]" />
          <span>27°C Light Rain • Inundation Risk Active</span>
        </div>
      </div>

      {/* Right: Threat Level, Alerts & Admin Profile */}
      <div className="flex items-center gap-3 text-xs">
        {/* Threat Level Badge */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase font-mono font-bold text-[#718096]">Threat Level:</span>
          <span className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border flex items-center gap-1 ${threatColorClass}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            {threatLevel}
          </span>
        </div>

        <span className="h-3.5 w-[1px] bg-[#E5E9ED]" />

        {/* Notification Bell */}
        <button 
          title="Active Notifications"
          className="relative p-1.5 rounded-md hover:bg-[#F5F6F7] text-[#718096] hover:text-[#18212B] transition"
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
