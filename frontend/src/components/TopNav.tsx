import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  ShieldAlert, 
  Building2, 
  Radio, 
  Smartphone, 
  Activity, 
  RotateCcw, 
  AlertTriangle 
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';

export const TopNav: React.FC = () => {
  const { state, triggerReset } = useAtlasStore();

  const metrics = state?.metrics || {
    active_incidents: 0,
    critical_incidents: 0,
    available_rescue_units: 0,
    active_rescue_units: 0,
    operational_hospitals: 0,
    estimated_affected_people: 0,
    pending_incidents: 0
  };

  return (
    <header className="bg-graphite border-b border-steel/60 px-4 py-2.5 flex items-center justify-between z-30 select-none">
      {/* Branding & Status */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-signal/15 border border-signal text-signal flex items-center justify-center font-black tracking-tighter rounded">
            Δ
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold tracking-wider text-base text-coolwhite">ATLAS</span>
              <span className="text-[10px] font-semibold bg-steel/60 px-1.5 py-0.5 rounded text-signal border border-signal/30 uppercase">
                2.0 CORE
              </span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono tracking-tight">
              Adaptive Terrain Intelligence & Life-saving Action System
            </div>
          </div>
        </div>

        {/* Live Scenario Disclaimer Pill */}
        <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-[11px] text-amber-400 font-mono font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>SIMULATION | NOT LIVE EMERGENCY DATA</span>
        </div>
      </div>

      {/* Real-time System Metrics Bar */}
      <div className="hidden xl:flex items-center gap-4 text-xs font-mono">
        <div className="flex items-center gap-1.5 bg-obsidian px-2.5 py-1 rounded border border-steel/40">
          <span className="text-gray-400">ACTIVE INCIDENTS:</span>
          <span className="text-signal font-bold">{metrics.active_incidents}</span>
          {metrics.critical_incidents > 0 && (
            <span className="text-[10px] bg-red-600/30 text-red-400 px-1 rounded font-sans font-bold">
              {metrics.critical_incidents} CRIT
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 bg-obsidian px-2.5 py-1 rounded border border-steel/40">
          <span className="text-gray-400">RESCUE UNITS:</span>
          <span className="text-emerald-400 font-bold">{metrics.available_rescue_units}</span>
          <span className="text-gray-500">/</span>
          <span className="text-coolwhite font-bold">{metrics.available_rescue_units + metrics.active_rescue_units}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-obsidian px-2.5 py-1 rounded border border-steel/40">
          <span className="text-gray-400">HOSPITALS:</span>
          <span className="text-blue-400 font-bold">{metrics.operational_hospitals}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-obsidian px-2.5 py-1 rounded border border-steel/40">
          <span className="text-gray-400">AFFECTED POP:</span>
          <span className="text-amber-400 font-bold">{metrics.estimated_affected_people}</span>
        </div>
      </div>

      {/* Multi-Portal Switcher & Reset */}
      <div className="flex items-center gap-3">
        <nav className="flex items-center bg-obsidian p-1 rounded border border-steel/60">
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-signal text-obsidian shadow-sm'
                  : 'text-gray-300 hover:text-coolwhite hover:bg-steel/30'
              }`
            }
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Admin</span>
          </NavLink>

          <NavLink
            to="/hospital"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-signal text-obsidian shadow-sm'
                  : 'text-gray-300 hover:text-coolwhite hover:bg-steel/30'
              }`
            }
          >
            <Building2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Hospital</span>
          </NavLink>

          <NavLink
            to="/rescuer"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-signal text-obsidian shadow-sm'
                  : 'text-gray-300 hover:text-coolwhite hover:bg-steel/30'
              }`
            }
          >
            <Radio className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Rescuer</span>
          </NavLink>

          <NavLink
            to="/app"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-signal text-obsidian shadow-sm'
                  : 'text-gray-300 hover:text-coolwhite hover:bg-steel/30'
              }`
            }
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Citizen SOS</span>
          </NavLink>
        </nav>

        {/* Global Reset Action */}
        <button
          onClick={() => triggerReset()}
          title="Reset scenario data to baseline"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-steel/30 hover:bg-steel/60 border border-steel/60 text-gray-300 hover:text-coolwhite text-xs font-mono transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5 text-signal" />
          <span className="hidden md:inline">Reset</span>
        </button>
      </div>
    </header>
  );
};
