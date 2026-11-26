import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Cpu,
  AlertCircle,
  Send,
  FileText,
  ShieldAlert,
  Clock,
  CheckCircle2,
  HelpCircle,
  Loader2
} from 'lucide-react';
import { api } from '../services/api';
import { useAtlasStore } from '../store/atlasStore';
import { Incident } from '../types/atlas';

interface GroqIntelPanelProps {
  selectedIncident?: Incident | null;
}

export const GroqIntelPanel: React.FC<GroqIntelPanelProps> = ({ selectedIncident }) => {
  const { nextImpactPrediction, setNextImpactPrediction } = useAtlasStore();
  const [aiStatus, setAiStatus] = useState<{ available: boolean; model?: string; fast_model?: string; provider?: string } | null>(null);
  const [briefing, setBriefing] = useState<any | null>(null);
  const [assessment, setAssessment] = useState<any | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [queryText, setQueryText] = useState('');
  const [queryResult, setQueryResult] = useState<any | null>(null);

  const [loadingPredict, setLoadingPredict] = useState(false);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [loadingAssess, setLoadingAssess] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingQuery, setLoadingQuery] = useState(false);

  const handlePredictImpact = async () => {
    setLoadingPredict(true);
    try {
      const res = await api.aiPredictNextImpact();
      setNextImpactPrediction(res);
    } catch (e: any) {
      setNextImpactPrediction({ available: false, reason: e.message || 'Network error' });
    } finally {
      setLoadingPredict(false);
    }
  };

  useEffect(() => {
    api.getAiStatus()
      .then((status) => {
        setAiStatus(status);
        if (status?.available && !nextImpactPrediction) {
          handlePredictImpact();
        }
      })
      .catch(() => setAiStatus({ available: false }));
  }, []);

  useEffect(() => {
    setAssessment(null);
    setSummary(null);
  }, [selectedIncident?.id]);

  const handleBriefing = async () => {
    setLoadingBriefing(true);
    try {
      const res = await api.aiOperationalBriefing();
      setBriefing(res);
    } catch (e: any) {
      setBriefing({ available: false, reason: e.message || 'Network error' });
    } finally {
      setLoadingBriefing(false);
    }
  };

  const handleAssess = async () => {
    if (!selectedIncident) return;
    setLoadingAssess(true);
    try {
      const res = await api.aiAssessIncident(selectedIncident.id);
      setAssessment(res);
    } catch (e: any) {
      setAssessment({ available: false, reason: e.message || 'Network error' });
    } finally {
      setLoadingAssess(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedIncident) return;
    setLoadingSummary(true);
    try {
      const res = await api.aiSummarizeIncident(selectedIncident.id);
      setSummary(res);
    } catch (e: any) {
      setSummary({ available: false, reason: e.message || 'Network error' });
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleQuery = async (qOverride?: string) => {
    const q = (qOverride ?? queryText).trim();
    if (!q) return;
    if (qOverride) setQueryText(qOverride);
    setLoadingQuery(true);
    try {
      const res = await api.aiOperationalQuery(q);
      setQueryResult(res);
    } catch (e: any) {
      setQueryResult({ available: false, reason: e.message || 'Network error' });
    } finally {
      setLoadingQuery(false);
    }
  };

  const renderUnavailable = (res: any) => (
    <div className="p-2.5 rounded border border-amber-300 bg-amber-50 text-[11px] text-amber-900 space-y-1">
      <div className="font-bold flex items-center gap-1.5">
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
        <span>AI Advisory Unavailable</span>
      </div>
      <div className="text-[10px] text-amber-800">{res?.reason || 'Groq API is not configured or unreachable.'}</div>
      <div className="text-[9px] font-mono text-amber-700">
        Operational dispatch & database workflows remain 100% active.
      </div>
    </div>
  );

  return (
    <div className="space-y-3 pt-2 border-t border-[#E5E9ED]">
      {/* Header & Model Provenance */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0F172A] font-mono">
          <Sparkles className="w-3.5 h-3.5 text-[#0284C7]" />
          <span>Groq AI Advisory</span>
        </div>
        {aiStatus?.available ? (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-50 text-[#0284C7] border border-sky-200 font-semibold">
            {aiStatus.model}
          </span>
        ) : (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
            KEY NOT SET
          </span>
        )}
      </div>

      {/* 0. PREDICTED NEXT IMPACT (Forward-Looking AI Advisory) */}
      <div className="p-2.5 rounded-lg border-2 border-purple-300 bg-purple-50/60 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 font-mono">
              PREDICTED NEXT IMPACT
            </span>
            <span className="text-[8px] font-mono px-1.5 py-0.2 rounded bg-purple-200 text-purple-900 font-bold uppercase">
              AI Projection
            </span>
          </div>
          <button
            disabled={loadingPredict}
            onClick={handlePredictImpact}
            className="px-2 py-0.5 rounded bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white text-[9px] font-mono font-semibold flex items-center gap-1"
          >
            {loadingPredict ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
            <span>{loadingPredict ? 'Analyzing...' : 'Predict'}</span>
          </button>
        </div>

        {!nextImpactPrediction && loadingPredict && (
          <div className="text-[10px] text-purple-800 font-mono">Analyzing live incidents, rainfall & hazards...</div>
        )}

        {nextImpactPrediction && !nextImpactPrediction.available && renderUnavailable(nextImpactPrediction)}

        {nextImpactPrediction?.available && nextImpactPrediction.prediction && (
          nextImpactPrediction.prediction.sufficient_data === false ? (
            <div className="p-2 rounded bg-white border border-purple-200 text-[11px] text-purple-950 font-semibold">
              {nextImpactPrediction.prediction.message || 'Insufficient data for reliable impact prediction.'}
              {nextImpactPrediction.prediction.why && (
                <div className="text-[10px] font-normal text-[#5B6777] mt-1">{nextImpactPrediction.prediction.why}</div>
              )}
            </div>
          ) : (
            <div className="p-2 rounded bg-white border border-purple-200 text-[11px] space-y-1.5">
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                <div><span className="text-[#5B6777] font-semibold">Location:</span> <span className="font-bold text-[#0F172A]">{nextImpactPrediction.prediction.location}</span></div>
                <div><span className="text-[#5B6777] font-semibold">Hazard:</span> <span className="font-bold text-[#0F172A]">{nextImpactPrediction.prediction.hazard}</span></div>
                <div><span className="text-[#5B6777] font-semibold">ETA:</span> <span className="font-mono font-bold text-purple-800">{nextImpactPrediction.prediction.eta}</span></div>
                <div>
                  <span className="text-[#5B6777] font-semibold">Risk:</span>{' '}
                  <span className={`font-bold px-1 py-0.2 rounded text-[9px] uppercase ${
                    nextImpactPrediction.prediction.risk === 'Critical' ? 'bg-red-100 text-red-700' :
                    nextImpactPrediction.prediction.risk === 'High' ? 'bg-orange-100 text-orange-700' :
                    'bg-amber-100 text-amber-800'
                  }`}>{nextImpactPrediction.prediction.risk}</span>
                </div>
                <div className="col-span-2"><span className="text-[#5B6777] font-semibold">Confidence:</span> <span className="font-mono text-[#0F172A]">{nextImpactPrediction.prediction.confidence}</span></div>
              </div>

              <div className="pt-1 border-t border-purple-100">
                <div className="text-[9px] font-bold uppercase text-purple-900">WHY:</div>
                <p className="text-[10px] text-[#111827] leading-snug mt-0.5">{nextImpactPrediction.prediction.why}</p>
              </div>

              {nextImpactPrediction.prediction.recommended_actions?.length > 0 && (
                <div className="pt-1 border-t border-purple-100">
                  <div className="text-[9px] font-bold uppercase text-purple-900">RECOMMENDED ACTIONS:</div>
                  <ul className="list-disc pl-4 text-[10px] text-[#111827] space-y-0.5 mt-0.5">
                    {nextImpactPrediction.prediction.recommended_actions.slice(0, 3).map((act: string, i: number) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>
              )}

              {nextImpactPrediction.prediction.supporting_evidence?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {nextImpactPrediction.prediction.supporting_evidence.slice(0, 5).map((ev: string, i: number) => (
                    <span key={i} className="px-1 py-0.2 rounded bg-purple-50 border border-purple-200 font-mono text-[9px] text-purple-900">{ev}</span>
                  ))}
                </div>
              )}

              <div className="text-[8px] font-mono text-[#5B6777] pt-0.5">
                UNVERIFIED AI PROJECTION • {nextImpactPrediction.model} • Zone overlaid on map
              </div>
            </div>
          )
        )}
      </div>

      {/* 1. Natural-Language Operational Query */}
      <div className="p-2.5 rounded-lg border border-[#DCE2E8] bg-[#F8FAFC] space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-[#5B6777] flex items-center justify-between">
          <span>Natural-Language Command Query</span>
          <span className="text-[9px] font-mono text-[#0284C7]">Read-Only</span>
        </div>
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setQueryText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
            placeholder="Ask about unassigned incidents, beds, alerts..."
            className="flex-1 px-2 py-1.5 rounded border border-[#DCE2E8] bg-white text-[11px] focus:outline-none focus:border-[#0284C7]"
          />
          <button
            disabled={loadingQuery || !queryText.trim()}
            onClick={() => handleQuery()}
            className="px-2.5 py-1.5 rounded bg-[#0F172A] hover:bg-[#1E293B] disabled:opacity-50 text-white text-[10px] font-semibold flex items-center gap-1"
          >
            {loadingQuery ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          </button>
        </div>

        <div className="flex flex-wrap gap-1">
          {[
            'Unassigned incidents?',
            'Hospital beds?',
            'Field alerts summary?'
          ].map(chip => (
            <button
              key={chip}
              onClick={() => handleQuery(chip)}
              className="px-1.5 py-0.5 rounded bg-white border border-[#DCE2E8] hover:border-[#0284C7] text-[9px] font-medium text-[#5B6777] hover:text-[#0F172A]"
            >
              {chip}
            </button>
          ))}
        </div>

        {queryResult && (
          queryResult.available ? (
            <div className="p-2 rounded bg-white border border-sky-200 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-[9px] font-mono text-[#0284C7]">
                <span>AI-GENERATED • {queryResult.model}</span>
                <span>{new Date(queryResult.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-[#111827] leading-snug">{queryResult.result?.answer}</p>
              {queryResult.result?.supporting_ids?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {queryResult.result.supporting_ids.map((id: string) => (
                    <span key={id} className="px-1 py-0.2 rounded bg-[#F3F5F8] font-mono text-[9px] font-bold text-[#0F172A]">{id}</span>
                  ))}
                </div>
              )}
              {queryResult.result?.data_gaps?.length > 0 && (
                <div className="text-[9px] text-amber-700">
                  Uncertainties: {queryResult.result.data_gaps.join('; ')}
                </div>
              )}
            </div>
          ) : renderUnavailable(queryResult)
        )}
      </div>

      {/* 2. Operational Briefing & Selected Incident AI Actions */}
      <div className="grid grid-cols-3 gap-1">
        <button
          disabled={loadingBriefing}
          onClick={handleBriefing}
          className="py-1.5 px-1.5 rounded bg-white hover:bg-sky-50 border border-[#DCE2E8] text-[10px] font-semibold text-[#0F172A] flex items-center justify-center gap-1"
        >
          {loadingBriefing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3 text-[#0284C7]" />}
          <span>Briefing</span>
        </button>
        <button
          disabled={loadingAssess || !selectedIncident}
          onClick={handleAssess}
          className="py-1.5 px-1.5 rounded bg-white hover:bg-sky-50 border border-[#DCE2E8] disabled:opacity-50 text-[10px] font-semibold text-[#0F172A] flex items-center justify-center gap-1"
        >
          {loadingAssess ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3 text-[#E85D2A]" />}
          <span>Assess</span>
        </button>
        <button
          disabled={loadingSummary || !selectedIncident}
          onClick={handleSummarize}
          className="py-1.5 px-1.5 rounded bg-white hover:bg-sky-50 border border-[#DCE2E8] disabled:opacity-50 text-[10px] font-semibold text-[#0F172A] flex items-center justify-center gap-1"
        >
          {loadingSummary ? <Loader2 className="w-3 h-3 animate-spin" /> : <Cpu className="w-3 h-3 text-[#15803D]" />}
          <span>Summarize</span>
        </button>
      </div>

      {/* Briefing Card */}
      {briefing && (
        briefing.available ? (
          <div className="p-2.5 rounded-lg bg-white border border-sky-200 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#0284C7]">
              <span>AI BRIEFING • ADVISORY</span>
              <span>{new Date(briefing.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="font-bold text-[#0F172A]">{briefing.briefing?.headline}</div>
            <p className="text-[#5B6777] leading-snug">{briefing.briefing?.situation_overview}</p>
            {briefing.briefing?.critical_and_unassigned?.length > 0 && (
              <ul className="list-disc pl-4 text-[10px] text-[#DC2626] space-y-0.5">
                {briefing.briefing.critical_and_unassigned.slice(0, 3).map((item: string, idx: number) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            )}
            <div className="text-[9px] font-mono text-[#5B6777] pt-1 border-t border-[#E5E9ED]">
              {briefing.provenance}
            </div>
          </div>
        ) : renderUnavailable(briefing)
      )}

      {/* Incident Assessment Card */}
      {assessment && (
        assessment.available ? (
          <div className="p-2.5 rounded-lg bg-white border border-[#E85D2A]/40 text-[11px] space-y-1.5">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#E85D2A]">
              <span>AI ASSESSMENT • {selectedIncident?.id}</span>
              <span>{assessment.model}</span>
            </div>
            <p className="text-[#111827] leading-snug">{assessment.assessment?.summary}</p>
            {assessment.assessment?.operational_risks?.length > 0 && (
              <div>
                <div className="text-[9px] font-bold uppercase text-[#5B6777]">Risks</div>
                <ul className="list-disc pl-4 text-[10px] text-[#111827]">
                  {assessment.assessment.operational_risks.slice(0, 3).map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {assessment.assessment?.uncertainties?.length > 0 && (
              <div className="text-[10px] text-amber-800 bg-amber-50 p-1.5 rounded">
                <b>Uncertainties:</b> {assessment.assessment.uncertainties.join('; ')}
              </div>
            )}
          </div>
        ) : renderUnavailable(assessment)
      )}

      {/* Incident Summary Card */}
      {summary && (
        summary.available ? (
          <div className="p-2.5 rounded-lg bg-white border border-emerald-200 text-[11px] space-y-1">
            <div className="flex items-center justify-between text-[9px] font-mono text-[#15803D]">
              <span>AI SUMMARY • {selectedIncident?.id}</span>
              <span>{summary.model}</span>
            </div>
            <p className="text-[#111827] leading-snug">{summary.summary?.what_happened}</p>
            <div className="text-[10px] text-[#5B6777]"><b>Response:</b> {summary.summary?.current_response}</div>
            <div className="text-[10px] text-[#5B6777]"><b>Medical:</b> {summary.summary?.medical_requirements}</div>
          </div>
        ) : renderUnavailable(summary)
      )}
    </div>
  );
};
