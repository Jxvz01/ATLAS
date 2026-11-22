import React from 'react';
import { 
  Cpu, 
  CheckCircle, 
  AlertTriangle, 
  Navigation, 
  Send, 
  Info, 
  ShieldAlert, 
  XCircle,
  Clock,
  Compass
} from 'lucide-react';
import { useAtlasStore } from '../../store/atlasStore';

export const IntelligencePanel: React.FC = () => {
  const { 
    state, 
    selectedIncidentId, 
    evaluationResult, 
    isEvaluating, 
    assignResource,
    updateIncident
  } = useAtlasStore();

  const selectedIncident = state?.incidents.find(i => i.id === selectedIncidentId);
  const activeAssignment = state?.assignments.find(a => a.incident_id === selectedIncidentId && a.assignment_status !== 'Canceled');
  const assignedUnit = activeAssignment ? state?.resources.find(r => r.id === activeAssignment.resource_id) : null;

  if (!selectedIncident) {
    return (
      <div className="flex flex-col h-full bg-graphite border-l border-steel/60 p-4">
        <div className="flex items-center gap-2 pb-3 border-b border-steel/50">
          <Cpu className="w-4 h-4 text-signal" />
          <span className="text-xs font-mono font-bold tracking-wider text-coolwhite uppercase">
            ATLAS Intelligence Engine
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-gray-500 font-mono text-xs">
          <Compass className="w-8 h-8 text-steel mb-2 animate-spin-slow" />
          <span>Select an incident from the queue or map to inspect AI assessment & adaptive response recommendation.</span>
        </div>
      </div>
    );
  }

  const handleQuickAssign = async () => {
    if (evaluationResult?.recommended_resource_id) {
      await assignResource(
        selectedIncident.id, 
        evaluationResult.recommended_resource_id,
        evaluationResult.explanation
      );
    }
  };

  return (
    <div className="flex flex-col h-full bg-graphite border-l border-steel/60 overflow-y-auto">
      {/* Header */}
      <div className="p-3 border-b border-steel/50 bg-obsidian/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-signal" />
            <span className="text-xs font-mono font-bold tracking-wider text-coolwhite uppercase">
              ATLAS Intelligence
            </span>
          </div>
          <span className="text-[10px] font-mono bg-steel/60 text-signal px-1.5 py-0.5 rounded">
            DETERMINISTIC V2
          </span>
        </div>
      </div>

      <div className="p-3.5 space-y-4 text-xs font-sans">
        {/* Selected Incident Meta Banner */}
        <div className="p-2.5 rounded bg-obsidian border border-steel/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-mono font-bold text-coolwhite">{selectedIncident.id}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
              selectedIncident.priority_level === 'Critical'
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
            }`}>
              {selectedIncident.priority_level} (Score {selectedIncident.priority_score})
            </span>
          </div>
          <div className="font-semibold text-coolwhite">{selectedIncident.type}</div>
          <div className="text-[11px] text-gray-400">{selectedIncident.description}</div>
          
          <div className="flex flex-wrap gap-2 pt-1 font-mono text-[10px] text-gray-400">
            <span>Req: {selectedIncident.required_capabilities.join(', ') || 'General Rescue'}</span>
            <span>•</span>
            <span>Est. Affected: {selectedIncident.affected_population}</span>
          </div>
        </div>

        {/* Existing Active Assignment Status */}
        {activeAssignment && (
          <div className="p-2.5 rounded bg-purple-950/20 border border-purple-500/40 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-purple-300">
                ACTIVE ASSIGNMENT: {activeAssignment.id}
              </span>
              <span className="text-[10px] font-mono bg-purple-900/60 text-purple-200 px-1.5 py-0.2 rounded">
                {activeAssignment.assignment_status}
              </span>
            </div>
            <div className="text-[11px] text-coolwhite">
              Unit: <span className="font-bold text-signal">{assignedUnit?.name || activeAssignment.resource_id}</span>
            </div>
            <div className="text-[10px] text-gray-400 font-mono">
              Route Distance: {activeAssignment.route_distance_km} km
            </div>
            <div className="text-[10px] text-gray-300 italic">
              "{activeAssignment.explanation}"
            </div>
          </div>
        )}

        {/* Engine Recommendation Card */}
        <div className="p-3 rounded bg-obsidian border border-signal/40 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-bold text-signal uppercase flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-signal" />
              Engine Recommendation
            </span>
            {isEvaluating && <span className="text-[10px] text-gray-400 animate-pulse font-mono">Evaluating...</span>}
          </div>

          {evaluationResult ? (
            <div className="space-y-2.5">
              <div className="p-2 rounded bg-graphite border border-steel/60 text-[11px] text-coolwhite leading-relaxed">
                {evaluationResult.explanation}
              </div>

              {evaluationResult.is_detour && (
                <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>
                    ADAPTIVE DETOUR ACTIVE: Direct route blocked by obstacle. Alternate path computed (+{evaluationResult.distance_km} km).
                  </span>
                </div>
              )}

              {/* Action: Dispatch Recommended Unit */}
              {selectedIncident.status === 'Active' && evaluationResult.recommended_resource_id && (
                <button
                  onClick={handleQuickAssign}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded bg-signal hover:bg-signal/90 text-obsidian font-bold text-xs uppercase tracking-wide transition shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Unit {evaluationResult.recommended_resource_id}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 font-mono">
              Analyzing candidates and road conditions...
            </div>
          )}
        </div>

        {/* Candidate Breakdown Table */}
        {evaluationResult?.candidate_evaluations && evaluationResult.candidate_evaluations.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-mono font-bold text-gray-400 uppercase">
              Candidate Unit Eligibility Matrix
            </div>
            <div className="divide-y divide-steel/40 border border-steel/40 rounded bg-obsidian/60 text-[10px] font-mono">
              {evaluationResult.candidate_evaluations.map((c: any) => (
                <div key={c.resource_id} className="p-2 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-coolwhite">{c.resource_id} • {c.name}</div>
                    <div className="text-gray-400">
                      Cap Match: {c.has_capability ? 'YES' : 'NO'} | Status: {c.status}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-gray-300">{c.distance_km} km</div>
                    <span className={`text-[9px] px-1 py-0.2 rounded ${
                      c.eligible ? 'text-emerald-400 bg-emerald-950/40' : 'text-gray-500'
                    }`}>
                      {c.eligible ? 'ELIGIBLE' : 'INELIGIBLE'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Administrator Incident Controls */}
        <div className="pt-2 border-t border-steel/50 flex items-center gap-2">
          <button
            onClick={() => updateIncident(selectedIncident.id, { status: 'Resolved' })}
            className="flex-1 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-300 font-mono text-[11px] transition text-center"
          >
            Mark Resolved
          </button>
          <button
            onClick={() => updateIncident(selectedIncident.id, { status: 'Flagged' })}
            className="px-3 py-1.5 rounded bg-steel/30 hover:bg-steel/60 border border-steel/60 text-gray-400 hover:text-coolwhite font-mono text-[11px] transition"
          >
            Flag/Hold
          </button>
        </div>
      </div>
    </div>
  );
};
