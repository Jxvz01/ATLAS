import React, { useState } from 'react';
import { 
  Radio, 
  Sparkles, 
  AlertTriangle, 
  Slash, 
  CloudRain, 
  Building2, 
  Info,
  Clock,
  ChevronRight,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  XCircle,
  Navigation,
  Compass,
  ArrowRight,
  Send,
  Activity,
  Bed,
  Layers,
  TrendingUp,
  Cpu
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';

interface LiveAlertsPanelProps {
  onSelectEntity?: (type: 'incident' | 'resource' | 'hospital' | 'blockage', id: string, coords?: [number, number]) => void;
}

export const LiveAlertsPanel: React.FC<LiveAlertsPanelProps> = ({ onSelectEntity }) => {
  const { 
    state, 
    selectedIncidentId, 
    setSelectedIncident, 
    evaluationResult,
    assignResource,
    updateIncident
  } = useAtlasStore();

  // Mode: 'alerts' (default) | 'intelligence' (ATLAS AI)
  const [activeTab, setActiveTab] = useState<'alerts' | 'intelligence'>('alerts');
  const [alertFilter, setAlertFilter] = useState<'All' | 'Incidents' | 'Roads' | 'Weather'>('All');
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);

  // Active incidents sorted by priority score descending
  const activeIncidents = [...(state?.incidents || [])]
    .filter(i => i.status !== 'Resolved')
    .sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0));

  const selectedIncident = (state?.incidents || []).find(i => i.id === selectedIncidentId) || activeIncidents[0];

  // Raw alerts list
  const rawAlerts: Array<{
    id: string;
    category: 'Incidents' | 'Roads' | 'Weather';
    type: string;
    title: string;
    description: string;
    location: string;
    severity: 'Critical' | 'Warning' | 'Moderate' | 'Informational';
    timeAgo: string;
    entityType?: 'incident' | 'resource' | 'hospital' | 'blockage';
    entityId?: string;
    coords?: [number, number];
  }> = [];

  // 1. Incidents alerts
  (state?.incidents || []).forEach((inc) => {
    if (inc.status === 'Resolved') return;
    const isCritical = inc.priority_level === 'Critical';
    rawAlerts.push({
      id: `ALT-${inc.id}`,
      category: 'Incidents',
      type: `${inc.id} • ${inc.type}`,
      title: inc.type,
      location: `Near (${inc.latitude.toFixed(3)}, ${inc.longitude.toFixed(3)})`,
      description: inc.description,
      severity: isCritical ? 'Critical' : 'Moderate',
      timeAgo: isCritical ? '2m ago' : '5m ago',
      entityType: 'incident',
      entityId: inc.id,
      coords: [inc.latitude, inc.longitude]
    });
  });

  // 2. Road blockages
  (state?.road_blockages || []).forEach((blk) => {
    if (blk.status !== 'Active') return;
    rawAlerts.push({
      id: `ALT-${blk.id}`,
      category: 'Roads',
      type: 'Road Obstacle',
      title: blk.road_id,
      location: blk.road_id,
      description: `${blk.reason}. Rerouting active.`,
      severity: 'Warning',
      timeAgo: '8m ago',
      entityType: 'blockage',
      entityId: blk.id,
      coords: [blk.latitude, blk.longitude]
    });
  });

  // 3. Significant hazard & weather alerts
  rawAlerts.push({
    id: 'ALT-WEATHER-1',
    category: 'Weather',
    type: 'Precipitation Alert',
    title: 'Catchment Surge Warning',
    location: 'Kukkarahalli Basin',
    description: 'Heavy precipitation continuing across Mysuru urban area.',
    severity: 'Informational',
    timeAgo: '12m ago',
    coords: [12.3040, 76.6340]
  });

  // 4. Hospital capacity alert if any critical
  const criticalHosp = (state?.hospitals || []).find(h => h.operational_status === 'Critical' || h.available_beds <= 8);
  if (criticalHosp) {
    rawAlerts.push({
      id: `ALT-HOSP-${criticalHosp.id}`,
      category: 'Incidents',
      type: 'Medical Facility Surge',
      title: criticalHosp.name,
      location: criticalHosp.name,
      description: `Critical ICU capacity (${criticalHosp.icu_capacity} available). Divert non-critical intake.`,
      severity: 'Critical',
      timeAgo: '15m ago',
      entityType: 'hospital',
      entityId: criticalHosp.id,
      coords: [criticalHosp.latitude, criticalHosp.longitude]
    });
  }

  // Filter alerts
  const filteredAlerts = rawAlerts.filter(a => {
    if (alertFilter === 'All') return true;
    return a.category === alertFilter;
  });

  const handleAlertClick = (alert: typeof rawAlerts[0]) => {
    if (alert.entityType === 'incident' && alert.entityId) {
      setSelectedIncident(alert.entityId);
    }
    if (onSelectEntity && alert.coords) {
      onSelectEntity(alert.entityType || 'incident', alert.entityId || '', alert.coords);
    }
  };

  const handleFocusIncident = (inc: Incident) => {
    setSelectedIncident(inc.id);
    if (onSelectEntity) {
      onSelectEntity('incident', inc.id, [inc.latitude, inc.longitude]);
    }
  };

  const handleApproveRecommendation = async () => {
    if (selectedIncident && evaluationResult?.recommended_resource_id) {
      await assignResource(
        selectedIncident.id,
        evaluationResult.recommended_resource_id,
        evaluationResult.explanation
      );
      setDecisionFeedback(`Approved: Unit ${evaluationResult.recommended_resource_id} dispatched to ${selectedIncident.id}.`);
      setTimeout(() => setDecisionFeedback(null), 4000);
    }
  };

  const handleRejectRecommendation = () => {
    setDecisionFeedback(`Recommendation bypassed by Operator for ${selectedIncident?.id}.`);
    setTimeout(() => setDecisionFeedback(null), 4000);
  };

  // Hospital match candidate for selected incident
  const recommendedHospital = (state?.hospitals || []).find(h => h.operational_status === 'Operational' && h.available_beds > 5) || (state?.hospitals || [])[0];

  return (
    <aside className="w-[340px] h-full bg-white border-l border-[#E5E9ED] flex flex-col select-none z-10 shadow-[-1px_0_4px_rgba(0,0,0,0.02)]">
      {/* TWO PRIMARY COMPACT TABS: Alerts | ATLAS AI */}
      <div className="p-2 border-b border-[#E5E9ED] bg-[#F5F6F7]/80 flex items-center gap-1.5">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'alerts'
              ? 'bg-white text-[#18212B] shadow-sm border border-[#E5E9ED]'
              : 'text-[#718096] hover:text-[#18212B]'
          }`}
        >
          <Radio className={`w-3.5 h-3.5 ${activeTab === 'alerts' ? 'text-[#F26A38]' : 'text-[#718096]'}`} />
          <span>Alerts</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[#E5E9ED] text-[#718096]">
            {filteredAlerts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('intelligence')}
          className={`flex-1 py-1.5 px-3 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
            activeTab === 'intelligence'
              ? 'bg-white text-[#F26A38] shadow-sm border border-[#E5E9ED]'
              : 'text-[#718096] hover:text-[#18212B]'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'intelligence' ? 'text-[#F26A38]' : 'text-[#718096]'}`} />
          <span>ATLAS AI</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#27966B]" />
        </button>
      </div>

      {/* --- TAB 1: ALERTS FEED --- */}
      {activeTab === 'alerts' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-Filters */}
          <div className="px-3 py-2 border-b border-[#E5E9ED] bg-white flex items-center gap-1">
            {(['All', 'Incidents', 'Roads', 'Weather'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setAlertFilter(tab)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  alertFilter === tab
                    ? 'bg-[#F26A38]/10 text-[#F26A38] font-semibold border border-[#F26A38]/30'
                    : 'text-[#718096] hover:text-[#18212B]'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Alert Feed List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#718096]">
                No active alerts under this category.
              </div>
            ) : (
              filteredAlerts.map(alert => {
                const isCrit = alert.severity === 'Critical';
                const isWarn = alert.severity === 'Warning';

                const accentBorder = isCrit 
                  ? 'border-l-4 border-l-[#DC3C3C]' 
                  : isWarn 
                  ? 'border-l-4 border-l-[#E6A23C]' 
                  : 'border-l-4 border-l-[#4386C6]';

                const badgeBg = isCrit
                  ? 'text-[#DC3C3C] bg-[#DC3C3C]/10'
                  : isWarn
                  ? 'text-[#E6A23C] bg-[#E6A23C]/10'
                  : 'text-[#4386C6] bg-[#4386C6]/10';

                return (
                  <div
                    key={alert.id}
                    onClick={() => handleAlertClick(alert)}
                    className={`p-2.5 rounded-md border border-[#E5E9ED] bg-white hover:bg-[#F5F6F7] cursor-pointer transition-all ${accentBorder} shadow-[0_1px_2px_rgba(0,0,0,0.02)]`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#18212B] text-xs">
                          {alert.title}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold ${badgeBg}`}>
                          {alert.severity}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#718096]">
                        {alert.timeAgo}
                      </span>
                    </div>

                    <p className="text-xs text-[#18212B] line-clamp-2 leading-relaxed">
                      {alert.description}
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[10px] text-[#718096]">
                      <span className="flex items-center gap-1 truncate max-w-[190px]">
                        <MapPin className="w-2.5 h-2.5 text-[#718096] shrink-0" />
                        <span className="truncate">{alert.location}</span>
                      </span>
                      <span className="text-[#F26A38] font-medium flex items-center gap-0.5">
                        Inspect &rsaquo;
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* --- TAB 2: ATLAS AI INTELLIGENCE & DECISION-SUPPORT LAYER --- */}
      {activeTab === 'intelligence' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-3 space-y-3.5 text-xs text-[#18212B]">
          {/* Operator Action Confirmation Banner */}
          {decisionFeedback && (
            <div className="p-2 rounded bg-[#27966B]/10 border border-[#27966B]/30 text-[11px] text-[#27966B] font-medium flex items-center gap-1.5 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{decisionFeedback}</span>
            </div>
          )}

          {/* Sub-Header: Decision Support Mode */}
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E9ED]">
            <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wider text-[#718096] font-mono">
              <Cpu className="w-3.5 h-3.5 text-[#F26A38]" />
              <span>Decision Support Engine</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#27966B]/10 text-[#27966B] font-bold">
              DETERMINISTIC
            </span>
          </div>

          {/* A. PRIORITY ASSESSMENT (Ranked Queue) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#18212B]">
              <span>A. Priority Assessment</span>
              <span className="text-[10px] text-[#718096] font-mono">Multi-factor Score</span>
            </div>

            <div className="space-y-1">
              {activeIncidents.slice(0, 3).map((inc, idx) => {
                const isSelected = selectedIncident?.id === inc.id;
                const isCrit = inc.priority_level === 'Critical';

                return (
                  <div
                    key={inc.id}
                    onClick={() => handleFocusIncident(inc)}
                    className={`p-2 rounded border cursor-pointer transition ${
                      isSelected
                        ? 'border-[#F26A38] bg-[#F26A38]/5'
                        : 'border-[#E5E9ED] bg-white hover:bg-[#F5F6F7]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-[#18212B] text-white font-mono font-bold text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-[#18212B]">{inc.id}</span>
                        <span className="text-[#718096]">({inc.type})</span>
                      </div>
                      <span className={`px-1.5 py-0.2 rounded font-mono font-bold text-[10px] ${
                        isCrit ? 'bg-[#DC3C3C]/10 text-[#DC3C3C]' : 'bg-[#F26A38]/10 text-[#F26A38]'
                      }`}>
                        Score {inc.priority_score || '4.2'}
                      </span>
                    </div>

                    <div className="text-[11px] text-[#718096] mt-1 line-clamp-1">
                      {inc.description}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#718096] font-mono pt-1 border-t border-[#E5E9ED]/50">
                      <span>Affected: <b className="text-[#18212B]">{inc.affected_population} pax</b></span>
                      <span>Confidence: <b className="text-[#27966B]">95%</b></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* B. POTENTIAL IMPACT FORECAST */}
          <div className="p-2.5 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#18212B]">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#4386C6]" />
                <span>B. Impact Forecast</span>
              </span>
              <span className="text-[9px] font-mono uppercase bg-[#4386C6]/10 text-[#4386C6] px-1 rounded font-semibold">
                MODEL PREDICTION (SIM)
              </span>
            </div>

            <div className="text-[11px] text-[#18212B] leading-snug">
              <b>Kukkarahalli Catchment:</b> Hydrodynamic model projects +0.4m canal surge over next 2 hours.
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[#718096] font-mono pt-1">
              <div>Horizon: <b className="text-[#18212B]">2 Hours</b></div>
              <div>Confidence: <b className="text-[#27966B]">88%</b></div>
              <div>Exposed Area: <b className="text-[#18212B]">1.4 km²</b></div>
              <div>Source: <b className="text-[#718096]">WRD Sensor Sim</b></div>
            </div>
          </div>

          {/* C. RESOURCE RECOMMENDATION (Contextual for Selected Incident) */}
          {selectedIncident && (
            <div className="p-2.5 rounded-lg border border-[#F26A38]/40 bg-white space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="flex items-center gap-1 text-[#F26A38]">
                  <Compass className="w-3.5 h-3.5 text-[#F26A38]" />
                  <span>C. Recommended Deployment</span>
                </span>
                <span className="text-[10px] font-mono text-[#718096]">
                  For {selectedIncident.id}
                </span>
              </div>

              {evaluationResult?.recommended_resource_id ? (
                <div className="space-y-2">
                  <div className="text-xs text-[#18212B] leading-relaxed bg-[#F5F6F7] p-2 rounded text-[11px]">
                    {evaluationResult.explanation}
                  </div>

                  {/* D. ROUTE INTELLIGENCE */}
                  <div className="p-2 rounded bg-white border border-[#E5E9ED] space-y-1 text-[11px]">
                    <div className="font-semibold text-[#18212B] flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3 h-3 text-[#F26A38]" />
                        <span>D. Route Intelligence</span>
                      </span>
                      <span className="font-mono text-[10px] text-[#27966B]">Verified Path</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-[#718096] font-mono">
                      <span>Travel Distance: <b className="text-[#18212B]">{evaluationResult.distance_km} km</b></span>
                      <span>Est. Travel Time: <b className="text-[#18212B]">~{Math.round(evaluationResult.distance_km * 3.5)} min</b></span>
                    </div>
                    {evaluationResult.is_detour && (
                      <div className="text-[10px] text-[#E6A23C] font-medium pt-0.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>Detour active: Circumventing submerged arterial node.</span>
                      </div>
                    )}
                  </div>

                  {/* E. HOSPITAL MATCHING */}
                  {recommendedHospital && (
                    <div className="p-2 rounded bg-[#F5F6F7] border border-[#E5E9ED] text-[11px] space-y-1">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="flex items-center gap-1 text-[#18212B]">
                          <Building2 className="w-3 h-3 text-[#4386C6]" />
                          <span>E. Casualty Reception Match</span>
                        </span>
                        <span className="text-[10px] font-mono text-[#27966B]">{recommendedHospital.operational_status}</span>
                      </div>
                      <div className="text-[#718096] text-[10px]">
                        Target Facility: <b className="text-[#18212B]">{recommendedHospital.name}</b>
                      </div>
                      <div className="flex justify-between text-[10px] font-mono text-[#718096]">
                        <span>Avail Beds: <b className="text-[#18212B]">{recommendedHospital.available_beds}</b></span>
                        <span>ICU: <b className="text-[#DC3C3C]">{recommendedHospital.icu_capacity}</b></span>
                        <span>Trauma Readiness: <b className="text-[#27966B]">Level 1</b></span>
                      </div>
                    </div>
                  )}

                  {/* Operational Decision Actions: Approve / Reject / Override */}
                  {selectedIncident.status === 'Active' && (
                    <div className="pt-1 flex items-center gap-1.5">
                      <button
                        onClick={handleApproveRecommendation}
                        className="flex-1 py-1.5 px-2 rounded bg-[#F26A38] hover:bg-[#d95828] text-white font-bold text-xs uppercase tracking-wide transition flex items-center justify-center gap-1 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve Dispatch</span>
                      </button>

                      <button
                        onClick={handleRejectRecommendation}
                        className="py-1.5 px-2.5 rounded bg-white hover:bg-[#F5F6F7] border border-[#E5E9ED] text-[#718096] hover:text-[#18212B] font-medium text-xs transition"
                        title="Reject or bypass this recommendation"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-[#718096] p-2 bg-[#F5F6F7] rounded">
                  All eligible response units currently deployed. Awaiting unit availability.
                </div>
              )}
            </div>
          )}

          {/* Quick Context Summary */}
          <div className="text-[10px] text-[#718096] font-mono text-center pt-1 border-t border-[#E5E9ED]">
            Decision Engine v2.0 • Deterministic Allocation Model
          </div>
        </div>
      )}

      {/* Subtle Bottom Status Note */}
      <div className="p-2 border-t border-[#E5E9ED] bg-[#F5F6F7] text-[10px] text-[#718096] font-mono flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#27966B]" />
          <span>Engine Sync: Live</span>
        </span>
        <span>SEOC Decision Support</span>
      </div>
    </aside>
  );
};
