import React, { useState, useEffect } from 'react';
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
  Cpu,
  MessageSquare,
  Siren,
  CheckCheck
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';
import { GroqIntelPanel } from './GroqIntelPanel';

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
    updateIncident,
    fieldAlerts,
    missionMessages,
    fetchFieldAlerts,
    fetchMissionMessages,
    updateFieldAlertDecision,
    sendMissionMessage,
    openData,
    osmInfrastructure,
    fetchOpenData,
    fetchOsmInfrastructure
  } = useAtlasStore();

  // Mode: 'alerts' (default) | 'field' (Field Coordination) | 'intelligence' (ATLAS AI) | 'opendata' (Open-Source Data)
  const [activeTab, setActiveTab] = useState<'alerts' | 'field' | 'intelligence' | 'opendata'>('alerts');
  const [alertFilter, setAlertFilter] = useState<'All' | 'Incidents' | 'Roads' | 'Weather'>('All');
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);
  const [activeCommsAlertId, setActiveCommsAlertId] = useState<string | null>(null);
  const [adminChatInput, setAdminChatInput] = useState('');
  const [adminChatSending, setAdminChatSending] = useState(false);
  const [manualUnitId, setManualUnitId] = useState('');

  // Poll field alerts every 3.5s
  useEffect(() => {
    fetchFieldAlerts();
    const timer = setInterval(() => {
      fetchFieldAlerts();
      if (activeCommsAlertId) {
        const activeAlert = fieldAlerts.find(a => a.id === activeCommsAlertId);
        const mId = activeAlert?.active_assignment_id || activeAlert?.original_incident_id || activeCommsAlertId;
        fetchMissionMessages(mId);
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [fetchFieldAlerts, fetchMissionMessages, activeCommsAlertId]);

  const unreviewedFieldAlerts = fieldAlerts.filter(a => a.status === 'Reported').length;

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
    <aside className="w-full lg:w-[360px] h-full flex flex-col gap-2 select-none z-10">
      {/* TOP CARD: CONTEXTUAL INSPECTOR & COORDINATION */}
      <div className="flex-1 min-h-0 bg-white border border-[#DCE2E8] rounded-lg flex flex-col overflow-hidden">
      {/* FOUR COMPACT TABS: Detail | Field | AI | Data */}
      <div className="p-2 border-b border-[#DCE2E8] bg-[#F8FAFC] flex items-center gap-1">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-1.5 px-1.5 rounded text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
            activeTab === 'alerts'
              ? 'bg-white text-[#111827] shadow-xs border border-[#DCE2E8]'
              : 'text-[#5B6777] hover:text-[#111827]'
          }`}
        >
          <Radio className={`w-3.5 h-3.5 ${activeTab === 'alerts' ? 'text-[#E85D2A]' : 'text-[#5B6777]'}`} />
          <span>{selectedIncidentId ? 'Detail' : 'Alerts'}</span>
        </button>

        <button
          onClick={() => setActiveTab('field')}
          className={`flex-1 py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition relative ${
            activeTab === 'field'
              ? 'bg-white text-[#DC3C3C] shadow-sm border border-[#E5E9ED]'
              : 'text-[#718096] hover:text-[#18212B]'
          }`}
        >
          <Siren className={`w-3.5 h-3.5 ${activeTab === 'field' ? 'text-[#DC3C3C]' : 'text-[#718096]'}`} />
          <span>Field</span>
          {unreviewedFieldAlerts > 0 ? (
            <span className="text-[10px] font-mono px-1.5 rounded-full bg-[#DC3C3C] text-white animate-pulse">
              {unreviewedFieldAlerts}
            </span>
          ) : (
            <span className="text-[10px] font-mono px-1 rounded-full bg-[#E5E9ED] text-[#718096]">
              {fieldAlerts.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('intelligence')}
          className={`flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
            activeTab === 'intelligence'
              ? 'bg-white text-[#F26A38] shadow-sm border border-[#E5E9ED]'
              : 'text-[#718096] hover:text-[#18212B]'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${activeTab === 'intelligence' ? 'text-[#F26A38]' : 'text-[#718096]'}`} />
          <span>AI</span>
          <span className="w-1.5 h-1.5 rounded-full bg-[#27966B]" />
        </button>

        <button
          onClick={() => {
            setActiveTab('opendata');
            if (!openData) fetchOpenData(false);
          }}
          className={`flex-1 py-1.5 px-1.5 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1 transition ${
            activeTab === 'opendata'
              ? 'bg-white text-[#0284C7] shadow-sm border border-[#E5E9ED]'
              : 'text-[#718096] hover:text-[#18212B]'
          }`}
        >
          <CloudRain className={`w-3.5 h-3.5 ${activeTab === 'opendata' ? 'text-[#0284C7]' : 'text-[#718096]'}`} />
          <span>Data</span>
        </button>
      </div>

      {/* --- TAB 1: CONTEXTUAL INCIDENT DETAIL & ALERTS FEED --- */}
      {activeTab === 'alerts' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Contextual Selected Incident Inspector */}
          {selectedIncident && (
            <div className="p-3 border-b border-[#DCE2E8] bg-[#F8FAFC] space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-[#0F172A]">{selectedIncident.id}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                    selectedIncident.priority_level === 'Critical'
                      ? 'bg-red-100 text-[#DC2626]'
                      : 'bg-amber-100 text-[#D97706]'
                  }`}>
                    {selectedIncident.priority_level}
                  </span>
                </div>
                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-white border border-[#DCE2E8] text-[#111827]">
                  {selectedIncident.status}
                </span>
              </div>

              <div className="text-xs font-bold text-[#111827]">{selectedIncident.type}</div>
              <p className="text-[11px] text-[#5B6777] leading-snug line-clamp-2">{selectedIncident.description}</p>

              <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono bg-white p-1.5 rounded border border-[#DCE2E8] tabular-nums">
                <div><span className="text-[#5B6777]">Affected:</span> <b>{selectedIncident.affected_population}</b></div>
                <div><span className="text-[#5B6777]">Sev:</span> <b>{selectedIncident.severity}/5</b></div>
                <div className="truncate"><span className="text-[#5B6777]">Src:</span> <b>{selectedIncident.source || 'SOS'}</b></div>
              </div>

              {/* Quick Dispatch / Resolve Action */}
              {selectedIncident.status === 'Active' ? (
                <div className="flex items-center gap-1.5 pt-0.5">
                  {evaluationResult?.recommended_resource_id ? (
                    <button
                      onClick={handleApproveRecommendation}
                      className="flex-1 py-1.5 px-2 rounded bg-[#E85D2A] hover:bg-[#d24e1e] text-white text-[11px] font-bold transition"
                    >
                      Dispatch {evaluationResult.recommended_resource_id}
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('intelligence')}
                      className="flex-1 py-1.5 px-2 rounded bg-[#0F172A] hover:bg-slate-800 text-white text-[11px] font-bold transition"
                    >
                      Open Dispatch / AI
                    </button>
                  )}
                  <button
                    onClick={() => updateIncident(selectedIncident.id, { status: 'Resolved' })}
                    className="py-1.5 px-2.5 rounded bg-white hover:bg-emerald-50 border border-[#DCE2E8] text-[#15803D] text-[11px] font-semibold"
                  >
                    Resolve
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between text-[10px] pt-0.5">
                  <span className="text-[#15803D] font-semibold">
                    {selectedIncident.status === 'Resolved' ? '✓ Incident Resolved' : 'Response Active'}
                  </span>
                  {selectedIncident.status !== 'Resolved' && (
                    <button
                      onClick={() => updateIncident(selectedIncident.id, { status: 'Resolved' })}
                      className="text-[#15803D] font-bold hover:underline"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

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

      {/* --- TAB 2: FIELD-TO-COMMAND COORDINATION --- */}
      {activeTab === 'field' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {decisionFeedback && (
            <div className="m-3 mb-0 p-2 rounded bg-[#27966B]/10 border border-[#27966B]/30 text-[11px] text-[#27966B] font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{decisionFeedback}</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {fieldAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#718096]">
                No field-discovered emergencies reported yet.
              </div>
            ) : (
              fieldAlerts.map(alert => {
                const isCommsOpen = activeCommsAlertId === alert.id;
                const missionId = alert.active_assignment_id || alert.original_incident_id || alert.id;
                return (
                  <div
                    key={alert.id}
                    className="p-3 rounded-lg border border-[#E5E9ED] bg-white shadow-xs space-y-2 border-l-4 border-l-[#DC3C3C]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[#18212B]">
                        {alert.emergency_type}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        alert.status === 'Combined' ? 'bg-emerald-100 text-emerald-700' :
                        alert.status === 'Separate Unit Assigned' ? 'bg-sky-100 text-sky-700' :
                        alert.status === 'Acknowledged' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {alert.status}
                      </span>
                    </div>

                    <div className="text-[10px] font-mono text-[#718096] flex items-center justify-between">
                      <span>From: <b className="text-[#18212B]">{alert.rescuer_name} ({alert.rescuer_id})</b></span>
                      <span>New: <b className="text-[#F26A38]">{alert.new_incident_id}</b></span>
                    </div>

                    <p className="text-xs text-[#18212B] leading-snug">{alert.description}</p>

                    <div className="flex flex-wrap gap-1.5 text-[10px] font-mono text-[#718096]">
                      <span className="px-1.5 py-0.5 bg-[#F5F6F7] rounded">Affected: {alert.people_affected}</span>
                      {alert.casualties > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-50 text-[#DC3C3C] rounded font-bold">Casualties: {alert.casualties}</span>
                      )}
                      {alert.requires_rescue && (
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">Rescue Req</span>
                      )}
                    </div>

                    {/* Command Decision Buttons */}
                    <div className="grid grid-cols-3 gap-1 pt-1">
                      <button
                        onClick={async () => {
                          await updateFieldAlertDecision(alert.id, {
                            status: 'Acknowledged',
                            command_decision: 'Field alert acknowledged by Command Center. Assessing dispatch options.',
                            decision_reason: 'Command review initiated'
                          });
                          setDecisionFeedback(`Acknowledged ${alert.id}`);
                          setTimeout(() => setDecisionFeedback(null), 3500);
                        }}
                        className="py-1.5 px-1.5 rounded bg-[#F5F6F7] hover:bg-amber-50 text-[#18212B] text-[10px] font-semibold border border-[#E5E9ED] transition"
                      >
                        Acknowledge
                      </button>
                      <button
                        onClick={async () => {
                          await updateFieldAlertDecision(alert.id, {
                            status: 'Combined',
                            command_decision: `Proceed to ${alert.new_incident_id} as combined secondary stop after securing current perimeter.`,
                            decision_reason: 'Proximity within active unit corridor'
                          });
                          setDecisionFeedback(`Combined mission ordered for ${alert.rescuer_id}`);
                          setTimeout(() => setDecisionFeedback(null), 3500);
                        }}
                        className="py-1.5 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold border border-emerald-200 transition"
                      >
                        Combine
                      </button>
                      <button
                        onClick={async () => {
                          await updateFieldAlertDecision(alert.id, {
                            status: 'Separate Unit Assigned',
                            command_decision: `Stay on original incident ${alert.original_incident_id}. Separate unit dispatched to ${alert.new_incident_id}.`,
                            decision_reason: 'Parallel dispatch required'
                          });
                          if (alert.new_incident_id) {
                            setSelectedIncident(alert.new_incident_id);
                          }
                          setDecisionFeedback(`Separate unit dispatch flagged for ${alert.new_incident_id}`);
                          setTimeout(() => setDecisionFeedback(null), 3500);
                        }}
                        className="py-1.5 px-1.5 rounded bg-sky-50 hover:bg-sky-100 text-sky-800 text-[10px] font-semibold border border-sky-200 transition"
                      >
                        Separate Unit
                      </button>
                    </div>

                    {/* Focus Map & Open Comms Bar */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-[#E5E9ED]">
                      <button
                        onClick={() => {
                          if (alert.new_incident_id) setSelectedIncident(alert.new_incident_id);
                          if (onSelectEntity && alert.latitude && alert.longitude) {
                            onSelectEntity('incident', alert.new_incident_id || '', [alert.latitude, alert.longitude]);
                          }
                        }}
                        className="text-[10px] font-semibold text-[#F26A38] hover:underline flex items-center gap-1"
                      >
                        <MapPin className="w-3 h-3" /> Focus Map
                      </button>

                      <button
                        onClick={async () => {
                          if (isCommsOpen) {
                            setActiveCommsAlertId(null);
                          } else {
                            setActiveCommsAlertId(alert.id);
                            await fetchMissionMessages(missionId);
                          }
                        }}
                        className="text-[10px] font-bold text-[#18212B] bg-[#F5F6F7] hover:bg-[#E5E9ED] px-2 py-1 rounded flex items-center gap-1"
                      >
                        <MessageSquare className="w-3 h-3 text-[#F26A38]" />
                        <span>{isCommsOpen ? 'Close Comms' : 'Open Comms'}</span>
                      </button>
                    </div>

                    {/* Inline Mission Comms Drawer */}
                    {isCommsOpen && (
                      <div className="mt-2 pt-2 border-t border-[#E5E9ED] space-y-2 bg-[#F8FAFC] p-2 rounded-md">
                        <div className="max-h-40 overflow-y-auto space-y-1.5">
                          {missionMessages.length === 0 ? (
                            <div className="text-[10px] text-[#718096] text-center py-2">No messages yet.</div>
                          ) : (
                            missionMessages.map(m => (
                              <div
                                key={m.id}
                                className={`p-1.5 rounded text-[10px] border ${
                                  m.sender_role === 'admin'
                                    ? 'bg-white border-[#F26A38]/40 text-[#18212B]'
                                    : 'bg-[#18212B] text-white border-[#18212B]'
                                }`}
                              >
                                <div className="flex justify-between font-bold text-[9px] mb-0.5">
                                  <span className={m.sender_role === 'admin' ? 'text-[#F26A38]' : 'text-emerald-400'}>
                                    {m.sender_name}
                                  </span>
                                  {m.sender_role === 'admin' && (
                                    <span className={m.acknowledged ? 'text-[#27966B]' : 'text-amber-600'}>
                                      {m.acknowledged ? '✓ Acked' : 'Pending Ack'}
                                    </span>
                                  )}
                                </div>
                                <div>{m.content}</div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={adminChatInput}
                            onChange={(e) => setAdminChatInput(e.target.value)}
                            placeholder="Send instruction to unit..."
                            className="flex-1 px-2 py-1.5 rounded border border-[#E5E9ED] bg-white text-[11px]"
                          />
                          <button
                            disabled={adminChatSending || !adminChatInput.trim()}
                            onClick={async () => {
                              if (!adminChatInput.trim()) return;
                              setAdminChatSending(true);
                              await sendMissionMessage(missionId, {
                                sender_id: 'SEOC-COMMAND',
                                sender_name: 'Command Center',
                                sender_role: 'admin',
                                message_type: 'instruction',
                                content: adminChatInput.trim(),
                                priority: 'Urgent',
                                field_alert_id: alert.id
                              });
                              setAdminChatInput('');
                              setAdminChatSending(false);
                            }}
                            className="px-2.5 py-1.5 rounded bg-[#F26A38] text-white text-[10px] font-bold"
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Consolidated Command Activity Timeline */}
            <div className="pt-3 mt-2 border-t border-[#DCE2E8] space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase text-[#5B6777]">
                <span>Command Activity Timeline</span>
                <span>{(state?.activity_logs || []).length} Events</span>
              </div>
              <div className="space-y-1.5">
                {(state?.activity_logs || []).slice(0, 8).map(log => (
                  <div key={log.id} className="p-2 rounded bg-[#F8FAFC] border border-[#DCE2E8] text-[10px] space-y-0.5">
                    <div className="flex items-center justify-between font-mono text-[9px] text-[#5B6777]">
                      <span className="font-bold text-[#0F172A]">{log.event_type}</span>
                      <span>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="text-[#111827] leading-snug">{log.message}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 3: ATLAS AI INTELLIGENCE & DECISION-SUPPORT LAYER --- */}
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
                <div className="space-y-2">
                  <div className="text-[11px] text-[#718096] p-2 bg-[#F5F6F7] rounded">
                    No automatic capability match found. Select an available unit for manual dispatch:
                  </div>
                  {selectedIncident.status === 'Active' && (
                    <div className="flex items-center gap-1.5">
                      <select
                        value={manualUnitId || (state?.resources.find(r => r.status === 'Available')?.id || '')}
                        onChange={(e) => setManualUnitId(e.target.value)}
                        className="flex-1 p-1.5 rounded border border-[#E5E9ED] bg-white text-xs font-semibold"
                      >
                        {(state?.resources || []).filter(r => r.status === 'Available').map(r => (
                          <option key={r.id} value={r.id}>{r.id} – {r.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          const targetId = manualUnitId || state?.resources.find(r => r.status === 'Available')?.id;
                          if (targetId) {
                            await assignResource(selectedIncident.id, targetId, `Manual Command Dispatch: Assigned ${targetId} to ${selectedIncident.id}`);
                            setDecisionFeedback(`Dispatched ${targetId} to ${selectedIncident.id}.`);
                            setTimeout(() => setDecisionFeedback(null), 4000);
                          }
                        }}
                        className="px-3 py-1.5 rounded bg-[#F26A38] hover:bg-[#d95828] text-white font-bold text-xs transition"
                      >
                        Dispatch
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* GROQ AI ADVISORY PANEL (ATLAS 2.0) */}
          <GroqIntelPanel selectedIncident={selectedIncident} />

          {/* Quick Context Summary */}
          <div className="text-[10px] text-[#718096] font-mono text-center pt-1 border-t border-[#E5E9ED]">
            Decision Engine v2.0 • Deterministic Allocation + Groq AI Advisory
          </div>
        </div>
      )}

      {/* --- TAB 4: OPEN-SOURCE DATA & OBSERVATIONS --- */}
      {activeTab === 'opendata' && (
        <div className="flex-1 flex flex-col overflow-y-auto p-3 space-y-3 text-xs text-[#18212B]">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5E9ED]">
            <div className="font-bold text-[11px] uppercase tracking-wider text-[#0284C7] font-mono">
              External Open-Source Data
            </div>
            <button
              onClick={() => fetchOpenData(false)}
              className="text-[10px] font-semibold text-[#0284C7] hover:underline"
            >
              Refresh
            </button>
          </div>

          <div className="p-2 rounded bg-sky-50 border border-sky-200 text-[10px] text-sky-900">
            <b>Separation Notice:</b> These feeds are <b>EXTERNAL OBSERVATIONS</b> and are kept separate from authoritative ATLAS operational records.
          </div>

          {/* 1. Open-Meteo Weather */}
          <div className="p-2.5 rounded-lg border border-[#E5E9ED] bg-[#F8FAFC] space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="font-bold text-[#18212B]">Open-Meteo Weather (Mysuru)</span>
              <span className={openData?.weather?.available ? 'text-[#27966B]' : 'text-amber-600'}>
                {openData?.weather?.available ? 'LIVE' : 'UNAVAILABLE'}
              </span>
            </div>
            {openData?.weather?.available ? (
              <div className="grid grid-cols-2 gap-1 text-[11px] pt-1 tabular-nums">
                <div>Temp: <b>{openData.weather.temperature_c}°C</b></div>
                <div>Rain: <b>{openData.weather.precipitation_mm} mm</b></div>
                <div>Wind: <b>{openData.weather.wind_speed_kmh} km/h</b></div>
                <div>Humidity: <b>{openData.weather.humidity_pct}%</b></div>
                <div className="col-span-2 text-[10px] text-[#718096]">
                  {openData.weather.condition} • {openData.weather.attribution}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-[#718096]">{openData?.weather?.reason || 'Loading weather...'}</div>
            )}
          </div>

          {/* 2. USGS Earthquakes */}
          <div className="p-2.5 rounded-lg border border-[#E5E9ED] bg-white space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="font-bold text-[#18212B]">USGS Seismic Feed (1200km)</span>
              <span className="text-[#718096]">{openData?.earthquakes?.count ?? 0} events</span>
            </div>
            {openData?.earthquakes?.available ? (
              openData.earthquakes.events.length === 0 ? (
                <div className="text-[10px] text-[#718096]">No M2.5+ seismic events in last 30 days.</div>
              ) : (
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {openData.earthquakes.events.slice(0, 5).map((eq: any) => (
                    <div key={eq.id} className="text-[10px] p-1.5 rounded bg-[#F8FAFC] border border-[#E5E9ED]">
                      <div className="font-semibold text-[#18212B]">{eq.title}</div>
                      <div className="text-[9px] font-mono text-[#718096]">Depth: {eq.depth_km} km • USGS</div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-[10px] text-[#718096]">{openData?.earthquakes?.reason || 'Loading USGS feed...'}</div>
            )}
          </div>

          {/* 3. NASA EONET Open Hazards */}
          <div className="p-2.5 rounded-lg border border-[#E5E9ED] bg-white space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="font-bold text-[#18212B]">NASA EONET Global Hazards</span>
              <span className="text-[#718096]">{openData?.eonet?.count ?? 0} open</span>
            </div>
            {openData?.eonet?.available ? (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {openData.eonet.events.slice(0, 5).map((ev: any) => (
                  <div key={ev.id} className="text-[10px] p-1.5 rounded bg-[#F8FAFC] border border-[#E5E9ED]">
                    <div className="font-semibold text-[#18212B] truncate">{ev.title}</div>
                    <div className="text-[9px] font-mono text-[#718096]">{ev.category} • NASA EONET</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-[#718096]">{openData?.eonet?.reason || 'Loading NASA EONET...'}</div>
            )}
          </div>

          {/* 4. OpenStreetMap Emergency Infrastructure */}
          <div className="p-2.5 rounded-lg border border-[#E5E9ED] bg-white space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="font-bold text-[#18212B]">OSM Emergency POIs (Mysuru)</span>
              <button
                onClick={() => fetchOsmInfrastructure()}
                className="px-2 py-0.5 rounded bg-[#0284C7] text-white text-[9px] font-bold"
              >
                {osmInfrastructure ? 'Reload OSM' : 'Load OSM POIs'}
              </button>
            </div>
            {osmInfrastructure?.available ? (
              <div className="text-[10px] text-[#5B6777]">
                Loaded <b>{osmInfrastructure.count}</b> hospitals, clinics & fire stations ({osmInfrastructure.attribution}). Toggle "OSM Emergency POIs" in Map Layers to view.
              </div>
            ) : osmInfrastructure ? (
              <div className="text-[10px] text-amber-700">{osmInfrastructure.reason}</div>
            ) : (
              <div className="text-[10px] text-[#718096]">Click "Load OSM POIs" to query Overpass API (cached 15m).</div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* BOTTOM CARD: AI OPERATIONAL BRIEFING (GROQ) */}
      <div className="bg-white border border-[#DCE2E8] rounded-lg p-3 space-y-2 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#0F172A]">
            <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
            <span>AI Operational Briefing</span>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-sky-50 border border-sky-200 text-[#0284C7] text-[9px] font-mono font-bold">
            Groq
          </span>
        </div>

        <p className="text-[11px] text-[#5B6777] leading-snug">
          {activeIncidents.length} active incidents ({activeIncidents.filter(i => i.priority_level === 'Critical').length} critical),{' '}
          {activeIncidents.filter(i => i.status === 'Active').length} unassigned.{' '}
          {(state?.resources || []).filter(r => r.status === 'Available').length} units available •{' '}
          {(state?.hospitals || []).reduce((acc, h) => acc + (h.available_beds || 0), 0)} hospital beds open.
        </p>

        <div className="grid grid-cols-4 gap-1">
          <button
            onClick={() => setActiveTab('intelligence')}
            className="py-1.5 px-1 rounded bg-[#F8FAFC] hover:bg-[#F3F5F8] border border-[#DCE2E8] text-[10px] font-semibold text-[#111827] transition"
          >
            Briefing
          </button>
          <button
            onClick={() => setActiveTab('intelligence')}
            className="py-1.5 px-1 rounded bg-[#F8FAFC] hover:bg-[#F3F5F8] border border-[#DCE2E8] text-[10px] font-semibold text-[#111827] transition"
          >
            Assess
          </button>
          <button
            onClick={() => setActiveTab('intelligence')}
            className="py-1.5 px-1 rounded bg-[#F8FAFC] hover:bg-[#F3F5F8] border border-[#DCE2E8] text-[10px] font-semibold text-[#111827] transition"
          >
            Summarize
          </button>
          <button
            onClick={() => setActiveTab('intelligence')}
            className="py-1.5 px-1 rounded bg-[#E85D2A] hover:bg-[#d24e1e] text-white text-[10px] font-bold transition"
          >
            Ask AI
          </button>
        </div>
      </div>
    </aside>
  );
};
