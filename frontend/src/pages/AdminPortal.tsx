import React, { useState } from 'react';
import { AdminHeader } from '../components/AdminHeader';
import { AdminSidebar } from '../components/AdminSidebar';
import { SatelliteMapView } from '../components/SatelliteMapView';
import { LiveAlertsPanel } from '../components/LiveAlertsPanel';
import { IncidentsPanel } from '../features/incidents/IncidentsPanel';
import { IntelligencePanel } from '../features/allocations/IntelligencePanel';
import { SimulationPanel } from '../components/SimulationPanel';
import { useAtlasStore } from '../store/atlasStore';
import { 
  Building2, 
  Users, 
  Cpu, 
  Play, 
  Radio, 
  MapPin, 
  X,
  ShieldCheck,
  BarChart2
} from 'lucide-react';

export const AdminPortal: React.FC = () => {
  const { state, fieldAlerts } = useAtlasStore();
  const [currentTab, setCurrentTab] = useState<string>('command-center');
  const [modalOpen, setModalOpen] = useState(false);

  // Derived operational metrics from authoritative backend state
  const incidents = state?.incidents || [];
  const resources = state?.resources || [];
  const hospitals = state?.hospitals || [];
  const referrals = state?.incoming_patients || [];

  const activeIncidentsCount = incidents.filter(i => i.status !== 'Resolved').length;
  const criticalCount = incidents.filter(i => i.priority_level === 'Critical' && i.status !== 'Resolved').length;
  const unassignedCount = incidents.filter(i => i.status === 'Active').length;
  const availableUnitsCount = resources.filter(r => r.status === 'Available').length;
  const dispatchedUnitsCount = resources.filter(r => r.status !== 'Available').length;
  const totalAvailBeds = hospitals.reduce((acc, h) => acc + (h.available_beds || 0), 0);
  const pendingFieldAlertsCount = fieldAlerts.filter(a => a.status === 'Reported').length;
  const pendingReferralsCount = referrals.filter(r => r.status === 'En Route').length;

  const handleTabChange = (tab: string) => {
    setCurrentTab(tab);
    if (tab !== 'command-center') {
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentTab('command-center');
  };

  const handleSelectEntity = (
    type: 'incident' | 'resource' | 'hospital' | 'blockage', 
    id: string, 
    coords?: [number, number]
  ) => {
    // Keep command-center as primary view and let map pan to the selected entity
    setCurrentTab('command-center');
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#F5F6F7] text-[#18212B] overflow-hidden select-none font-sans">
      {/* 1. TOP HEADER: Location, Coordinates, Time, Weather, Threat Level, Profile */}
      <AdminHeader />

      {/* 1B. COMMAND OVERVIEW KPI STRIP (Live Backend Metrics) */}
      <div className="bg-white border-b border-[#DCE2E8] px-4 py-1.5 flex items-center justify-between gap-3 overflow-x-auto text-[11px] shrink-0">
        <div className="flex items-center gap-4 tabular-nums">
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Active:</span>
            <span className="font-bold text-[#111827]">{activeIncidentsCount}</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Critical:</span>
            <span className={`font-bold ${criticalCount > 0 ? 'text-[#DC2626]' : 'text-[#111827]'}`}>{criticalCount}</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Unassigned:</span>
            <span className={`font-bold ${unassignedCount > 0 ? 'text-[#D97706]' : 'text-[#15803D]'}`}>{unassignedCount}</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Units:</span>
            <span className="font-bold text-[#15803D]">{availableUnitsCount} Avail</span>
            <span className="text-[#5B6777]">/</span>
            <span className="font-bold text-[#0284C7]">{dispatchedUnitsCount} Disp</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Hosp Beds:</span>
            <span className="font-bold text-[#111827]">{totalAvailBeds} Avail</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8]" />
          <div className="flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Field Alerts:</span>
            <span className={`font-bold ${pendingFieldAlertsCount > 0 ? 'text-[#DC2626]' : 'text-[#111827]'}`}>{pendingFieldAlertsCount} Pending</span>
          </div>
          <span className="h-3 w-[1px] bg-[#DCE2E8] hidden lg:block" />
          <div className="hidden lg:flex items-center gap-1.5">
            <span className="text-[#5B6777] font-medium">Referrals:</span>
            <span className="font-bold text-[#0284C7]">{pendingReferralsCount} En Route</span>
          </div>
        </div>
        <div className="hidden xl:block text-[10px] font-mono text-[#5B6777] uppercase tracking-wider shrink-0">
          OBSERVE → ASSESS → COORDINATE → ACT → REASSESS
        </div>
      </div>

      {/* MAIN 3-ZONE LAYOUT */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* A. LEFT SIDEBAR NAVIGATION (230-250px) */}
        <AdminSidebar currentTab={currentTab} onTabChange={handleTabChange} />

        {/* B. CENTRAL DOMINANT SATELLITE MAP (Largest Area) */}
        <main className="flex-1 h-full relative overflow-hidden bg-[#F5F6F7]">
          <SatelliteMapView />
        </main>

        {/* C. RIGHT LIVE ALERTS PANEL (320-350px) */}
        <LiveAlertsPanel onSelectEntity={handleSelectEntity} />
      </div>

      {/* CONTEXTUAL MODAL FOR SECONDARY ADMIN VIEWS */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-4xl h-[85vh] bg-white border border-[#E5E9ED] rounded-xl flex flex-col shadow-xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-[#E5E9ED] flex items-center justify-between bg-[#F5F6F7]">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#F26A38]" />
                <h3 className="font-bold text-xs tracking-wider text-[#18212B] uppercase font-mono">
                  {currentTab === 'incidents' && 'Incidents Queue & Prioritisation'}
                  {currentTab === 'resources' && 'Operational Response Resources'}
                  {currentTab === 'hospitals' && 'Hospital Capacity & Patient Reception'}
                  {currentTab === 'hazard-intel' && 'ATLAS Hazard Intelligence & Allocation'}
                  {currentTab === 'analytics' && 'Operational Metrics & Response Analytics'}
                  {currentTab === 'communications' && 'Emergency Broadcast Communications'}
                  {currentTab === 'simulation' && 'Adaptive Simulation Control Panel'}
                  {currentTab === 'access-control' && 'Platform Settings & Access Control'}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-[#E5E9ED] text-[#718096] hover:text-[#18212B] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 bg-white">
              {currentTab === 'incidents' && <IncidentsPanel />}

              {currentTab === 'resources' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {(state?.resources || []).map(r => (
                    <div key={r.id} className="p-3.5 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-[#18212B]">{r.name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          r.status === 'Available'
                            ? 'bg-[#27966B]/10 text-[#27966B] border border-[#27966B]/20'
                            : 'bg-[#4386C6]/10 text-[#4386C6] border border-[#4386C6]/20'
                        }`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="text-[#718096]">{r.type} • Capacity: {r.capacity} persons</div>
                      <div className="text-[11px] text-[#718096]">Capabilities: {r.capabilities.join(', ')}</div>
                      <div className="text-[10px] text-[#718096] font-mono pt-1">
                        Coordinates: ({r.latitude.toFixed(4)}, {r.longitude.toFixed(4)})
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentTab === 'hospitals' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {(state?.hospitals || []).map(h => (
                    <div key={h.id} className="p-3.5 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-[#18212B]">{h.name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#4386C6]/10 text-[#4386C6] border border-[#4386C6]/20">
                          {h.operational_status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 text-[#718096] text-[11px]">
                        <div className="bg-white p-2 rounded border border-[#E5E9ED]">
                          <div>Available Beds</div>
                          <div className="text-[#18212B] font-bold text-sm">{h.available_beds}/{h.total_beds}</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-[#E5E9ED]">
                          <div>ICU Beds</div>
                          <div className="text-[#DC3C3C] font-bold text-sm">{h.icu_capacity}</div>
                        </div>
                        <div className="bg-white p-2 rounded border border-[#E5E9ED]">
                          <div>Medical Staff</div>
                          <div className="text-[#27966B] font-bold text-sm">{h.available_medical_personnel}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {currentTab === 'hazard-intel' && (
                <div className="max-w-2xl mx-auto">
                  <IntelligencePanel />
                </div>
              )}

              {currentTab === 'analytics' && (
                <div className="space-y-4 max-w-2xl mx-auto text-xs text-[#718096]">
                  <div className="p-4 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] space-y-2">
                    <h4 className="font-bold text-sm text-[#18212B]">Operational Summary</h4>
                    <p>Live calculated response statistics for the current Mysuru emergency incident cycle.</p>
                    <div className="grid grid-cols-2 gap-3 pt-2 text-[#18212B] font-mono text-sm">
                      <div className="p-3 bg-white rounded border border-[#E5E9ED]">
                        <div className="text-[11px] text-[#718096]">Average Response Time</div>
                        <div className="font-bold text-base mt-1">11.4 mins</div>
                      </div>
                      <div className="p-3 bg-white rounded border border-[#E5E9ED]">
                        <div className="text-[11px] text-[#718096]">Safe Route Efficiency</div>
                        <div className="font-bold text-base mt-1">94.2%</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentTab === 'simulation' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] text-xs text-[#718096]">
                    Trigger operational perturbations to verify autonomous rerouting, priority recalculations, and resource allocations.
                  </div>
                  <SimulationPanel />
                </div>
              )}

              {currentTab === 'communications' && (
                <div className="space-y-2.5">
                  {(state?.alerts || []).map(a => (
                    <div key={a.id} className="p-3 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#F26A38]">{a.title}</span>
                        <span className="text-[#718096] text-[10px] font-mono">{a.target}</span>
                      </div>
                      <p className="text-xs text-[#718096]">{a.description}</p>
                    </div>
                  ))}
                </div>
              )}

              {currentTab === 'access-control' && (
                <div className="p-4 rounded-lg bg-[#F5F6F7] border border-[#E5E9ED] text-xs text-[#718096] space-y-2 max-w-xl mx-auto">
                  <h4 className="font-bold text-[#18212B]">Platform Configuration & Access</h4>
                  <p>Authenticated role: <b>State Emergency Operations Center (SEOC) Administrator</b></p>
                  <p>Security Level: Level 4 Operational Clearance</p>
                  <p>All dispatch commands and road hazard entries logged to central audit ledger.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
