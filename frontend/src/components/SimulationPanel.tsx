import React, { useState } from 'react';
import { 
  Play, 
  AlertCircle, 
  ShieldAlert, 
  Slash, 
  RotateCcw, 
  HeartCrack, 
  CheckCircle2, 
  RefreshCw 
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';

export const SimulationPanel: React.FC = () => {
  const { 
    triggerSimNewIncident, 
    triggerSimBlockRoad, 
    triggerSimUnitUnavailable, 
    triggerSimReduceCapacity, 
    triggerSimRestoreRoad, 
    triggerReset,
    recomputeGlobal
  } = useAtlasStore();

  const [busyAction, setBusyAction] = useState<string | null>(null);

  const handleAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="bg-graphite border border-steel/60 rounded p-3 select-none">
      <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-steel/40">
        <div className="flex items-center gap-2">
          <Play className="w-3.5 h-3.5 text-signal fill-signal" />
          <span className="text-xs font-mono font-bold tracking-wider text-coolwhite uppercase">
            Adaptive Simulation Engine
          </span>
        </div>
        <button
          onClick={() => handleAction('recompute', recomputeGlobal)}
          disabled={busyAction !== null}
          className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 border border-cyan-800/60 px-2 py-0.5 rounded transition"
        >
          <RefreshCw className={`w-3 h-3 ${busyAction === 'recompute' ? 'animate-spin' : ''}`} />
          <span>Recompute Engine</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {/* Scenario 1: New Critical Incident */}
        <button
          onClick={() => handleAction('crit', triggerSimNewIncident)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-red-500/40 hover:border-red-500 hover:bg-red-950/20 text-gray-200 transition text-center group"
        >
          <AlertCircle className="w-4 h-4 text-red-500 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">New Critical Incident</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">+ Breach & 8 Trapped</span>
        </button>

        {/* Scenario 2: Block Road */}
        <button
          onClick={() => handleAction('block', triggerSimBlockRoad)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-amber-500/40 hover:border-amber-500 hover:bg-amber-950/20 text-gray-200 transition text-center group"
        >
          <Slash className="w-4 h-4 text-amber-500 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">Block Road</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">Simulate Corridor Cut</span>
        </button>

        {/* Scenario 3: Unit Unavailable */}
        <button
          onClick={() => handleAction('unit', triggerSimUnitUnavailable)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-purple-500/40 hover:border-purple-500 hover:bg-purple-950/20 text-gray-200 transition text-center group"
        >
          <ShieldAlert className="w-4 h-4 text-purple-400 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">Unit Unavailable</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">Trigger Mechanical Failure</span>
        </button>

        {/* Scenario 4: Hospital Capacity Surge */}
        <button
          onClick={() => handleAction('hosp', triggerSimReduceCapacity)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-pink-500/40 hover:border-pink-500 hover:bg-pink-950/20 text-gray-200 transition text-center group"
        >
          <HeartCrack className="w-4 h-4 text-pink-500 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">Hospital Saturated</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">ICU Overload Surge</span>
        </button>

        {/* Scenario 5: Restore Road */}
        <button
          onClick={() => handleAction('restore', triggerSimRestoreRoad)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-emerald-500/40 hover:border-emerald-500 hover:bg-emerald-950/20 text-gray-200 transition text-center group"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
          <span className="text-[11px] font-bold">Restore Road</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">Clear Debris / Reopen</span>
        </button>

        {/* Scenario 6: Reset */}
        <button
          onClick={() => handleAction('reset', triggerReset)}
          disabled={busyAction !== null}
          className="flex flex-col items-center justify-center p-2 rounded bg-obsidian border border-signal/40 hover:border-signal hover:bg-signal/10 text-gray-200 transition text-center group"
        >
          <RotateCcw className="w-4 h-4 text-signal mb-1 group-hover:rotate-180 transition-transform" />
          <span className="text-[11px] font-bold">Reset Scenario</span>
          <span className="text-[9px] text-gray-400 font-mono mt-0.5">Restore Baseline State</span>
        </button>
      </div>
    </div>
  );
};
