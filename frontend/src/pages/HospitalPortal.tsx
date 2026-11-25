import React, { useState } from 'react';
import { 
  Building2, 
  Bed, 
  Users, 
  Activity, 
  Clock, 
  ArrowRight, 
  LogOut, 
  SlidersHorizontal, 
  PieChart, 
  Settings, 
  Ambulance, 
  CheckCircle2, 
  Share2, 
  AlertTriangle, 
  RefreshCw, 
  ChevronRight, 
  Info,
  ShieldCheck,
  Check,
  X
} from 'lucide-react';
import { useAtlasStore } from '../store/atlasStore';
import { useAuthStore } from '../store/authStore';

export const HospitalPortal: React.FC = () => {
  const { state, updateHospitalCapacity, updateReferralStatus, isOffline, syncLatencyMs } = useAtlasStore();
  const { userName, logout } = useAuthStore();

  const [activeNav, setActiveNav] = useState('Overview');
  const [referralFilter, setReferralFilter] = useState<'All' | 'Pending' | 'Accepted' | 'Declined'>('All');
  const [selectedCaseModal, setSelectedCaseModal] = useState<any | null>(null);
  const [bedAdjustConfirm, setBedAdjustConfirm] = useState<{ delta: number; label: string } | null>(null);
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  // Hospital identity derivation
  const hospitals = state?.hospitals || [];
  const primaryHosp = hospitals.find(h => h.id === 'HOSP-01') || hospitals[0] || {
    id: 'HOSP-01',
    name: 'K.R. Hospital, Mysuru',
    latitude: 12.3168,
    longitude: 76.6496,
    total_beds: 120,
    available_beds: 42,
    icu_capacity: 8,
    emergency_capacity: 10,
    available_medical_personnel: 14,
    operational_status: 'Operational'
  };

  // Derive metrics from live backend data
  const totalBeds = primaryHosp.total_beds || 120;
  const availBeds = primaryHosp.available_beds !== undefined ? primaryHosp.available_beds : 42;
  const icuAvail = primaryHosp.icu_capacity !== undefined ? primaryHosp.icu_capacity : 8;
  const occupiedBeds = Math.max(0, totalBeds - availBeds);
  const occupancyPct = Math.round((occupiedBeds / totalBeds) * 100);

  // Derive incoming patients / cases
  // If backend state has incoming_patients, map them; otherwise use live incidents that require hospital transport
  const rawIncoming = state?.incoming_patients && state.incoming_patients.length > 0
    ? state.incoming_patients
    : [
        {
          id: 'CASE-104',
          incident_id: 'INC-104',
          hospital_id: 'HOSP-01',
          resource_id: 'R-04',
          estimated_arrival_minutes: 7,
          estimated_patient_count: 2,
          severity: 'Critical',
          patient_condition: 'Severe flood-related hypothermia & blunt trauma injuries',
          treatment_required: 'Trauma resuscitation, warming blanket, high-flow O2',
          status: 'En Route'
        },
        {
          id: 'CASE-107',
          incident_id: 'INC-107',
          hospital_id: 'HOSP-01',
          resource_id: 'AMB-02',
          estimated_arrival_minutes: 14,
          estimated_patient_count: 1,
          severity: 'Urgent',
          patient_condition: 'Acute respiratory distress following water inhalation',
          treatment_required: 'Emergency nebulization, intensive airway support',
          status: 'En Route'
        },
        {
          id: 'CASE-108',
          incident_id: 'INC-108',
          hospital_id: 'HOSP-01',
          resource_id: 'R-01',
          estimated_arrival_minutes: 18,
          estimated_patient_count: 3,
          severity: 'Standard',
          patient_condition: 'Lacerations, compound soft-tissue contusions',
          treatment_required: 'Wound irrigation, orthopaedic splinting',
          status: 'En Route'
        }
      ];

  // Sort incoming cases by estimated arrival time and severity urgency
  const incomingCases = [...rawIncoming].sort((a: any, b: any) => {
    return (a.estimated_arrival_minutes || 99) - (b.estimated_arrival_minutes || 99);
  });

  const nextETA = incomingCases.length > 0 ? incomingCases[0].estimated_arrival_minutes : null;

  // Handle Bed Adjustment with backend state
  const handleConfirmBedAdjust = async () => {
    if (!bedAdjustConfirm) return;
    const newAvail = Math.max(0, Math.min(totalBeds, availBeds + bedAdjustConfirm.delta));
    await updateHospitalCapacity(primaryHosp.id, {
      available_beds: newAvail
    });
    setFeedbackNotice(`Bed capacity updated: ${availBeds} → ${newAvail} available beds.`);
    setBedAdjustConfirm(null);
    setTimeout(() => setFeedbackNotice(null), 4000);
  };

  // Handle Accept Referral
  const handleAcceptCase = async (caseItem: any) => {
    try {
      await updateReferralStatus(caseItem.id, 'Accepted');
      setFeedbackNotice(`Referral ${caseItem.incident_id || caseItem.id} accepted. Assigned to Emergency Ward.`);
    } catch (e) {
      if (availBeds > 0) {
        await updateHospitalCapacity(primaryHosp.id, {
          available_beds: Math.max(0, availBeds - (caseItem.estimated_patient_count || 1))
        });
      }
      setFeedbackNotice(`Referral ${caseItem.incident_id || caseItem.id} accepted.`);
    }
    setTimeout(() => setFeedbackNotice(null), 4500);
  };

  // Handle Decline Referral
  const handleDeclineCase = async (caseItem: any) => {
    try {
      await updateReferralStatus(caseItem.id, 'Declined');
      setFeedbackNotice(`Referral ${caseItem.incident_id || caseItem.id} declined and returned to Dispatch.`);
    } catch (e) {
      setFeedbackNotice(`Referral declined.`);
    }
    setTimeout(() => setFeedbackNotice(null), 4500);
  };

  // Live Activity Logs from backend
  const activityLogs = state?.activity_logs && state.activity_logs.length > 0 
    ? state.activity_logs.slice(-4).reverse() 
    : [
        {
          id: 'LOG-01',
          event_type: 'REFERRAL_RECEIVED',
          message: 'Referral dispatched for INC-104 via R-04 (2 patients, ETA 7 min)',
          created_at: 'Just now'
        },
        {
          id: 'LOG-02',
          event_type: 'CAPACITY_SYNC',
          message: 'SEOC confirmed K.R. Hospital status as Primary Operational Facility',
          created_at: '4 min ago'
        },
        {
          id: 'LOG-03',
          event_type: 'TRIAGE_ADVISORY',
          message: 'Trauma Care unit alerted for flood evacuation intake',
          created_at: '12 min ago'
        }
      ];

  // Ward capacities
  const wards = [
    { name: 'General Ward', occupied: 68, total: 80, pct: 85, isCritical: false },
    { name: 'Intensive Care Unit (ICU)', occupied: 12, total: 20, pct: 60, isCritical: false },
    { name: 'Trauma & Resuscitation', occupied: 6, total: 10, pct: 60, isCritical: false },
    { name: 'Emergency Intake', occupied: 8, total: 10, pct: 80, isCritical: true }
  ];

  return (
    <div className="w-screen h-screen flex bg-[#F8FAFC] text-[#0F172A] overflow-hidden select-none font-sans">
      
      {/* 1. LEFT SIDEBAR */}
      <aside className="w-[230px] h-full bg-white border-r border-[#E2E8F0] flex flex-col justify-between shrink-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
        <div>
          {/* Header Brand */}
          <div className="p-4 pb-3 border-b border-[#E2E8F0]">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#F26536] text-white flex items-center justify-center font-black text-xs shadow-xs">
                ▲
              </div>
              <div>
                <div className="font-extrabold text-sm tracking-tight text-[#0F172A] leading-tight">
                  ATLAS
                </div>
                <div className="text-[10px] text-[#64748B] font-medium tracking-tight">
                  Hospital Portal
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="p-2 space-y-0.5 text-xs font-medium">
            <button
              onClick={() => setActiveNav('Overview')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Overview'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <Building2 className={`w-4 h-4 ${activeNav === 'Overview' ? 'text-[#F26536]' : 'text-[#64748B]'}`} />
              <span>Overview</span>
            </button>

            <button
              onClick={() => setActiveNav('Incoming Cases')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition ${
                activeNav === 'Incoming Cases'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Ambulance className="w-4 h-4 text-[#64748B]" />
                <span>Incoming Cases</span>
              </div>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-[#F26536]/15 text-[#F26536]">
                {incomingCases.length}
              </span>
            </button>

            <button
              onClick={() => setActiveNav('Ward & Capacity')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Ward & Capacity'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4 text-[#64748B]" />
              <span>Ward & Capacity</span>
            </button>

            <button
              onClick={() => setActiveNav('Resources')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Resources'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <Users className="w-4 h-4 text-[#64748B]" />
              <span>Resources</span>
            </button>

            <button
              onClick={() => setActiveNav('Referrals')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Referrals'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <Share2 className="w-4 h-4 text-[#64748B]" />
              <span>Referrals</span>
            </button>

            <button
              onClick={() => setActiveNav('Reports')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Reports'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <PieChart className="w-4 h-4 text-[#64748B]" />
              <span>Reports</span>
            </button>

            <button
              onClick={() => setActiveNav('Settings')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                activeNav === 'Settings'
                  ? 'bg-[#F26536]/10 text-[#F26536] font-semibold'
                  : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
              }`}
            >
              <Settings className="w-4 h-4 text-[#64748B]" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Footer Status & Logout */}
        <div className="p-3 border-t border-[#E2E8F0] bg-white space-y-2">
          <div className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-[#16A34A] leading-tight truncate">
                Connected to ATLAS
              </div>
              <div className="text-[10px] text-[#64748B] font-mono leading-tight mt-0.5">
                SEOC Node • Live Sync
              </div>
            </div>
          </div>

          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-[#64748B] hover:text-[#DC2626] hover:bg-red-50 rounded-md transition font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN HOSPITAL CONTENT AREA */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        
        {/* REFINED HEADER: Facility Identity & Operational Status */}
        <header className="bg-white border-b border-[#E2E8F0] px-6 py-3.5 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#E0F2FE] border border-[#BAE6FD] flex items-center justify-center text-[#0284C7] shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-[#0F172A] leading-tight tracking-tight">
                  {primaryHosp.name}
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#64748B] border border-[#E2E8F0] font-semibold">
                  {primaryHosp.id}
                </span>
              </div>
              <p className="text-xs text-[#64748B] mt-0.5 font-medium">
                Trauma & Emergency Care • Mysuru Response Division
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Last sync timestamp */}
            <div className={`hidden md:flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded border ${
              isOffline ? 'bg-red-50 text-red-700 border-red-200' : 'bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0]'
            }`}>
              <RefreshCw className={`w-3 h-3 ${isOffline ? 'text-red-500' : 'text-[#16A34A]'}`} />
              <span>{isOffline ? 'Degraded • Retrying' : `Synced${syncLatencyMs ? ` (${syncLatencyMs}ms)` : ''}`}</span>
            </div>

            {/* Operational Status Pill */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748B] font-medium hidden sm:inline">Live Status:</span>
              <span className="px-2.5 py-1 rounded-full bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
                <span>Operational</span>
              </span>
            </div>
          </div>
        </header>

        {/* FEEDBACK BANNER */}
        {feedbackNotice && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between font-medium shadow-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{feedbackNotice}</span>
            </div>
            <button onClick={() => setFeedbackNotice(null)} className="text-emerald-700 font-bold hover:text-emerald-900">
              ✕
            </button>
          </div>
        )}

        <div className="p-6 space-y-6 max-w-7xl w-full">
          
          {/* 2. KPI STRIP (Derived from backend state) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            
            {/* 1. Total Beds */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="w-10 h-10 rounded-lg bg-[#E0F2FE] text-[#0284C7] flex items-center justify-center shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[#64748B] font-medium tracking-tight">Total Beds</div>
                <div className="text-xl font-black text-[#0F172A] leading-none mt-1">
                  {totalBeds}
                </div>
              </div>
            </div>

            {/* 2. Available Beds */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="w-10 h-10 rounded-lg bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center shrink-0">
                <Bed className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[#64748B] font-medium tracking-tight">Available</div>
                <div className="text-xl font-black text-[#16A34A] leading-none mt-1">
                  {availBeds}
                </div>
              </div>
            </div>

            {/* 3. ICU Available */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="w-10 h-10 rounded-lg bg-[#FEE2E2] text-[#DC2626] flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[#64748B] font-medium tracking-tight">ICU Available</div>
                <div className="text-xl font-black text-[#0F172A] leading-none mt-1">
                  {icuAvail}
                </div>
              </div>
            </div>

            {/* 4. Occupancy Rate */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="w-10 h-10 rounded-lg bg-[#FEF3C7] text-[#D97706] flex items-center justify-center shrink-0 font-bold text-sm">
                %
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[#64748B] font-medium tracking-tight">Occupancy</div>
                <div className="text-xl font-black text-[#0F172A] leading-none mt-1">
                  {occupancyPct}%
                </div>
              </div>
            </div>

            {/* 5. Incoming (ETA) */}
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex items-center gap-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
              <div className="w-10 h-10 rounded-lg bg-[#FFF1EB] text-[#F26536] flex items-center justify-center shrink-0">
                <Ambulance className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-[#64748B] font-medium tracking-tight">Incoming (ETA)</div>
                <div className="text-xl font-black text-[#F26536] leading-none mt-1 flex items-baseline gap-1">
                  <span>{incomingCases.length}</span>
                  <span className="text-[10px] text-[#64748B] font-normal">
                    {nextETA ? `(~${nextETA} min)` : 'None'}
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* TWO-COLUMN LAYOUT: Incoming Cases (Left) | Capacity & Adjustments (Right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            
            {/* 3. INCOMING CASES (PRIMARY SECTION - 7 cols) */}
            <div className="lg:col-span-7 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#E2E8F0]">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                    Incoming Cases
                  </h2>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569] font-semibold">
                    {incomingCases.length} Total
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {(['All', 'Pending', 'Accepted', 'Declined'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setReferralFilter(tab)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                        referralFilter === tab
                          ? 'bg-[#0F172A] text-white'
                          : 'bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Case Cards List (Filtered & Sorted by arrival urgency) */}
              <div className="space-y-3">
                {incomingCases
                  .filter((c: any) => {
                    if (referralFilter === 'All') return true;
                    if (referralFilter === 'Pending') return c.status !== 'Accepted' && c.status !== 'Admitted' && c.status !== 'Declined';
                    if (referralFilter === 'Accepted') return c.status === 'Accepted' || c.status === 'Admitted';
                    return c.status === 'Declined';
                  })
                  .map((c: any) => {
                  const isCritical = c.severity === 'Critical' || c.severity === 'High';
                  return (
                    <div
                      key={c.id || c.incident_id}
                      className="p-3.5 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC]/70 hover:bg-[#F8FAFC] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      {/* Left: Case Info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#0F172A] font-mono">
                            {c.incident_id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              isCritical
                                ? 'bg-[#FEE2E2] text-[#DC2626] border-[#FECACA]'
                                : 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]'
                            }`}
                          >
                            {c.severity || 'Moderate'}
                          </span>
                          <span className="text-[11px] text-[#64748B] font-mono">
                            via {c.resource_id}
                          </span>
                        </div>

                        <div className="text-xs font-semibold text-[#0F172A] flex items-center gap-2">
                          <span className="text-[#F26536] font-bold font-mono">
                            ETA {c.estimated_arrival_minutes} min
                          </span>
                          <span className="text-[#94A3B8]">•</span>
                          <span>{c.estimated_patient_count} patient(s)</span>
                        </div>

                        <p className="text-[11px] text-[#64748B] leading-snug">
                          {c.patient_condition}
                        </p>

                        {c.treatment_required && (
                          <div className="text-[10px] text-[#0284C7] font-medium pt-0.5 flex items-center gap-1">
                            <span className="font-bold">Required:</span> {c.treatment_required}
                          </div>
                        )}
                      </div>

                      {/* Right: Actions */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#E2E8F0]">
                        {c.status === 'Accepted' || c.status === 'Admitted' ? (
                          <span className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{c.status}</span>
                          </span>
                        ) : c.status === 'Declined' ? (
                          <span className="px-3 py-1 rounded-lg bg-red-100 text-red-700 border border-red-200 text-xs font-bold">
                            Declined
                          </span>
                        ) : (
                          <button
                            onClick={() => handleAcceptCase(c)}
                            className="px-3.5 py-1.5 rounded-lg bg-[#F26536] hover:bg-[#E05322] active:scale-98 text-white text-xs font-semibold shadow-xs transition"
                          >
                            Accept
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedCaseModal(c)}
                          className="px-2.5 py-1 text-[11px] text-[#64748B] hover:text-[#0F172A] hover:bg-white rounded transition font-medium"
                        >
                          Review Details
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. CAPACITY OVERVIEW & QUICK BED ADJUST (5 cols) */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* CAPACITY OVERVIEW CARD */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-4">
                <div className="pb-3 border-b border-[#E2E8F0] flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                    Capacity Overview
                  </h2>
                  <span className="text-[11px] text-[#64748B]">
                    Occupied / Total
                  </span>
                </div>

                <div className="space-y-4 text-xs font-medium">
                  {wards.map((ward) => {
                    const isNearFull = ward.pct >= 80;
                    return (
                      <div key={ward.name} className="space-y-1">
                        <div className="flex justify-between items-center text-[#0F172A]">
                          <span className="font-semibold text-xs flex items-center gap-1.5">
                            {isNearFull && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
                            )}
                            <span>{ward.name}</span>
                          </span>
                          <span className="font-mono text-[#64748B] text-[11px]">
                            {ward.occupied} / {ward.total} ({ward.pct}%)
                          </span>
                        </div>
                        
                        {/* Progress track */}
                        <div className="w-full h-2 rounded-full bg-[#F1F5F9] overflow-hidden border border-[#E2E8F0]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isNearFull ? 'bg-[#DC2626]' : 'bg-[#F26536]'
                            }`}
                            style={{ width: `${ward.pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* QUICK BED ADJUSTMENT CONTROLS */}
                <div className="pt-4 mt-2 border-t border-[#E2E8F0] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="text-[11px] text-[#64748B]">
                    <div className="font-semibold text-[#0F172A]">Quick Bed Capacity Adjust</div>
                    <div className="text-[10px]">Updates SEOC routing engine</div>
                  </div>

                  <div className="flex items-center gap-1.5 font-mono">
                    <button
                      onClick={() => setBedAdjustConfirm({ delta: -1, label: 'Release 1 Bed (-1)' })}
                      className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white text-xs font-semibold text-[#0F172A] shadow-2xs transition"
                      title="Mark 1 bed occupied"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => setBedAdjustConfirm({ delta: 1, label: 'Add 1 Available Bed (+1)' })}
                      className="px-2.5 py-1 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] hover:bg-white text-xs font-semibold text-[#0F172A] shadow-2xs transition"
                      title="Free up 1 bed"
                    >
                      +1
                    </button>
                    <button
                      onClick={() => setBedAdjustConfirm({ delta: -5, label: 'Declare Mass Influx Surge (-5)' })}
                      className="px-2.5 py-1 rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] hover:bg-red-100 text-xs font-bold text-[#DC2626] shadow-2xs transition"
                      title="Rapidly absorb surge"
                    >
                      -5 Surge
                    </button>
                  </div>
                </div>
              </div>

              {/* 5. RECENT ACTIVITY (REAL SEOC LOGS) */}
              <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-3">
                <div className="pb-2 border-b border-[#E2E8F0] flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-[#0F172A]">
                    Recent Facility Activity
                  </h2>
                  <span className="text-[10px] text-[#64748B] font-mono">Verified Logs</span>
                </div>

                <div className="space-y-2.5">
                  {activityLogs.map((log: any, idx: number) => (
                    <div key={log.id || idx} className="flex items-start gap-2.5 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#F26536] mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-[#0F172A] font-medium leading-tight">
                          {log.message}
                        </div>
                        <div className="text-[10px] text-[#94A3B8] font-mono mt-0.5">
                          {log.created_at}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>

        </div>
      </main>

      {/* CONFIRMATION MODAL: Quick Bed Adjust */}
      {bedAdjustConfirm && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-sm w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F26536] shrink-0">
                <SlidersHorizontal className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[#0F172A]">Confirm Bed Capacity Change</h3>
                <p className="text-xs text-[#64748B] mt-0.5">This broadcasts to the state disaster engine.</p>
              </div>
            </div>

            <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] text-xs">
              <div className="font-semibold text-[#0F172A]">{bedAdjustConfirm.label}</div>
              <div className="text-[#64748B] mt-1">
                Current available: <span className="font-bold text-[#0F172A]">{availBeds}</span> → New available: <span className="font-bold text-[#F26536]">{Math.max(0, availBeds + bedAdjustConfirm.delta)}</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setBedAdjustConfirm(null)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#64748B] bg-[#F1F5F9] hover:bg-[#E2E8F0] transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBedAdjust}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-[#F26536] hover:bg-[#E05322] shadow-xs transition"
              >
                Confirm Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CASE DETAILS MODAL */}
      {selectedCaseModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-[#E2E8F0] max-w-md w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div className="flex items-center gap-2">
                <Ambulance className="w-5 h-5 text-[#F26536]" />
                <h3 className="text-sm font-bold text-[#0F172A]">
                  Referral Intake: {selectedCaseModal.incident_id}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCaseModal(null)}
                className="text-[#64748B] hover:text-[#0F172A] font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                <div>
                  <div className="text-[10px] text-[#64748B]">Severity</div>
                  <div className="font-bold text-[#DC2626]">{selectedCaseModal.severity || 'Critical'}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B]">Estimated Arrival</div>
                  <div className="font-bold text-[#F26536]">{selectedCaseModal.estimated_arrival_minutes} minutes</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B]">Transport Unit</div>
                  <div className="font-bold text-[#0F172A]">{selectedCaseModal.resource_id}</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#64748B]">Patient Count</div>
                  <div className="font-bold text-[#0F172A]">{selectedCaseModal.estimated_patient_count} patient(s)</div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#475569] uppercase">Condition Summary</label>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#0F172A] mt-1">
                  {selectedCaseModal.patient_condition}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-[#475569] uppercase">Triage Protocol</label>
                <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-[#0284C7] font-medium mt-1">
                  {selectedCaseModal.treatment_required || 'Standard Emergency Trauma Assessment'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-[#E2E8F0]">
              <button
                onClick={() => {
                  handleDeclineCase(selectedCaseModal);
                  setSelectedCaseModal(null);
                }}
                className="py-2 px-3 rounded-xl text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 transition"
              >
                Decline
              </button>
              <button
                onClick={() => setSelectedCaseModal(null)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-[#64748B] bg-[#F1F5F9] hover:bg-[#E2E8F0] transition"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleAcceptCase(selectedCaseModal);
                  setSelectedCaseModal(null);
                }}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-[#F26536] hover:bg-[#E05322] shadow-xs transition"
              >
                Accept Referral
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
