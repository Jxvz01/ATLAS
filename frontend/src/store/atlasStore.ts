import { create } from 'zustand';
import { ScenarioState, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert, FieldAlert, MissionMessage } from '../types/atlas';
import { api } from '../services/api';
import { networkMonitor, NetworkState } from '../services/networkMonitor';
import { offlineQueue } from '../services/offlineQueue';

interface AtlasStore {
  state: ScenarioState | null;
  loading: boolean;
  error: string | null;
  selectedIncidentId: string | null;
  selectedResourceId: string | null;
  selectedHospitalId: string | null;
  activeRole: 'admin' | 'hospital' | 'rescuer' | 'citizen';
  evaluationResult: any | null;
  isEvaluating: boolean;
  lastSyncedAt: string | null;
  syncLatencyMs: number | null;
  isOffline: boolean;
  networkState: NetworkState;
  lowBandwidthMode: boolean;
  openData: any | null;
  osmInfrastructure: any | null;
  nextImpactPrediction: any | null;
  setNextImpactPrediction: (pred: any | null) => void;
  
  fetchState: () => Promise<void>;
  refreshNetworkState: () => void;
  toggleLowBandwidthMode: () => void;
  fetchOpenData: (includeOsm?: boolean) => Promise<void>;
  fetchOsmInfrastructure: () => Promise<void>;
  setSelectedIncident: (id: string | null) => void;
  setSelectedResource: (id: string | null) => void;
  setSelectedHospital: (id: string | null) => void;
  setActiveRole: (role: 'admin' | 'hospital' | 'rescuer' | 'citizen') => void;
  evaluateIncident: (id: string) => Promise<void>;
  recomputeGlobal: () => Promise<void>;
  assignResource: (incidentId: string, resourceId: string, explanation?: string) => Promise<void>;
  updateAssignmentStatus: (assignmentId: string, status: string) => Promise<void>;
  updateHospitalCapacity: (hospitalId: string, data: Partial<Hospital>) => Promise<void>;
  updateIncident: (incidentId: string, updates: Partial<Incident>) => Promise<void>;
  updateResourceStatus: (resourceId: string, status: string) => Promise<void>;
  reportRoadBlockage: (roadId: string, lat: number, lon: number, reason: string) => Promise<void>;
  clearRoadBlockage: (blockageId: string) => Promise<void>;
  submitSOS: (data: { type: string; description: string; latitude: number; longitude: number; affected_population: number }) => Promise<Incident>;
  updateReferralStatus: (referralId: string, status: string) => Promise<void>;
  updateShelterOccupancy: (shelterId: string, occupancy: number) => Promise<void>;
  
  // Field Alerts & Mission Messages
  fieldAlerts: FieldAlert[];
  missionMessages: MissionMessage[];
  fetchFieldAlerts: () => Promise<void>;
  fetchMissionMessages: (missionId: string) => Promise<void>;
  submitFieldAlert: (data: any) => Promise<any>;
  sendMissionMessage: (missionId: string, data: any) => Promise<any>;
  acknowledgeMessage: (messageId: string) => Promise<void>;
  updateFieldAlertDecision: (alertId: string, decision: any) => Promise<void>;

  // Simulations
  triggerSimNewIncident: () => Promise<void>;
  triggerSimBlockRoad: () => Promise<void>;
  triggerSimUnitUnavailable: () => Promise<void>;
  triggerSimReduceCapacity: () => Promise<void>;
  triggerSimRestoreRoad: () => Promise<void>;
  triggerReset: () => Promise<void>;
}

export const useAtlasStore = create<AtlasStore>((set, get) => ({
  state: null,
  loading: false,
  error: null,
  selectedIncidentId: null,
  selectedResourceId: null,
  selectedHospitalId: null,
  activeRole: 'admin',
  evaluationResult: null,
  isEvaluating: false,
  lastSyncedAt: null,
  syncLatencyMs: null,
  isOffline: false,
  networkState: networkMonitor.getState(),
  lowBandwidthMode: networkMonitor.isManualLowBandwidth(),
  openData: null,
  osmInfrastructure: null,
  nextImpactPrediction: null,
  setNextImpactPrediction: (pred) => set({ nextImpactPrediction: pred }),

  refreshNetworkState: () => {
    set({
      networkState: networkMonitor.getState(),
      isOffline: networkMonitor.getState() === 'OFFLINE',
    });
  },

  toggleLowBandwidthMode: () => {
    const next = !get().lowBandwidthMode;
    networkMonitor.setManualLowBandwidth(next);
    set({
      lowBandwidthMode: next,
      networkState: networkMonitor.getState(),
    });
  },

  fetchState: async () => {
    const started = performance.now();
    try {
      const data = await api.getScenarioState();
      const latency = Math.round(performance.now() - started);
      networkMonitor.recordSuccess(latency);
      set({
        state: data,
        error: null,
        isOffline: false,
        networkState: networkMonitor.getState(),
        syncLatencyMs: latency,
        lastSyncedAt: new Date().toISOString()
      });
      const currentSelected = get().selectedIncidentId;
      if (currentSelected && !get().isEvaluating) {
        get().evaluateIncident(currentSelected);
      }
    } catch (err: any) {
      networkMonitor.recordFailure();
      set({
        error: err.message || 'Failed to fetch ATLAS state',
        isOffline: true,
        networkState: networkMonitor.getState()
      });
    }
  },

  fetchOpenData: async (includeOsm = false) => {
    try {
      const data = await api.getOpenDataOverview(includeOsm);
      set({ openData: data });
    } catch (e) {
      console.error('Open data fetch failed', e);
    }
  },

  fetchOsmInfrastructure: async () => {
    try {
      const data = await api.getOsmInfrastructure();
      set({ osmInfrastructure: data });
    } catch (e) {
      console.error('OSM infrastructure fetch failed', e);
    }
  },

  setSelectedIncident: (id) => {
    set({ selectedIncidentId: id });
    if (id) {
      get().evaluateIncident(id);
    } else {
      set({ evaluationResult: null });
    }
  },

  setSelectedResource: (id) => set({ selectedResourceId: id }),
  setSelectedHospital: (id) => set({ selectedHospitalId: id }),
  setActiveRole: (role) => set({ activeRole: role }),

  evaluateIncident: async (id: string) => {
    set({ isEvaluating: true });
    try {
      const res = await api.evaluateIncident(id);
      set({ evaluationResult: res, isEvaluating: false });
    } catch (err) {
      set({ isEvaluating: false });
    }
  },

  recomputeGlobal: async () => {
    await api.recomputeAllocations();
    await get().fetchState();
  },

  assignResource: async (incidentId, resourceId, explanation) => {
    await api.assignResource(incidentId, resourceId, explanation);
    await get().fetchState();
  },

  updateAssignmentStatus: async (assignmentId, status) => {
    try {
      await api.updateAssignment(assignmentId, status);
      await get().fetchState();
    } catch (e) {
      await offlineQueue.enqueue({
        kind: 'assignment_status',
        summary: `Mission status → ${status}`,
        payload: { assignment_id: assignmentId, status }
      });
      get().refreshNetworkState();
    }
  },

  updateHospitalCapacity: async (hospitalId, data) => {
    await api.updateHospitalCapacity(hospitalId, data);
    await get().fetchState();
  },

  updateIncident: async (incidentId, updates) => {
    await api.updateIncident(incidentId, updates);
    await get().fetchState();
  },

  updateResourceStatus: async (resourceId, status) => {
    await api.updateResourceStatus(resourceId, status);
    await get().fetchState();
  },

  reportRoadBlockage: async (roadId, lat, lon, reason) => {
    await api.reportBlockage(roadId, lat, lon, reason);
    await get().fetchState();
  },

  clearRoadBlockage: async (blockageId) => {
    await api.clearBlockage(blockageId);
    await get().fetchState();
  },

  submitSOS: async (data) => {
    const inc = await api.createIncident(data);
    await get().fetchState();
    return inc;
  },

  updateReferralStatus: async (referralId: string, status: string) => {
    await api.updateReferral(referralId, { status });
    await get().fetchState();
  },

  updateShelterOccupancy: async (shelterId: string, occupancy: number) => {
    await api.updateShelter(shelterId, { current_occupancy: occupancy });
    await get().fetchState();
  },

  fieldAlerts: [],
  missionMessages: [],

  fetchFieldAlerts: async () => {
    try {
      const data = await api.getFieldAlerts();
      set({ fieldAlerts: data });
    } catch (e) {
      console.error('Failed to fetch field alerts', e);
    }
  },

  fetchMissionMessages: async (missionId: string) => {
    try {
      const data = await api.getMissionMessages(missionId);
      set({ missionMessages: data });
    } catch (e) {
      console.error('Failed to fetch mission messages', e);
    }
  },

  submitFieldAlert: async (data: any) => {
    const clientId = `ALT-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    try {
      const res = await api.submitFieldAlert({ ...data, client_id: clientId });
      await get().fetchFieldAlerts();
      await get().fetchState();
      return { ...res, queuedOffline: false };
    } catch (e) {
      const q = await offlineQueue.enqueue({
        id: clientId,
        kind: 'field_alert',
        missionId: data.active_assignment_id,
        incidentId: data.original_incident_id,
        sender: data.rescuer_id,
        recipient: 'SEOC-COMMAND',
        summary: `Nearby ${data.emergency_type}: ${data.description.slice(0, 45)}`,
        payload: data
      });
      get().refreshNetworkState();
      return { queuedOffline: true, queueItem: q };
    }
  },

  sendMissionMessage: async (missionId: string, data: any) => {
    const clientId = `MSG-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    try {
      await api.sendMissionMessage(missionId, { ...data, client_id: clientId });
      await get().fetchMissionMessages(missionId);
      return { queuedOffline: false };
    } catch (e) {
      const q = await offlineQueue.enqueue({
        id: clientId,
        kind: 'mission_message',
        missionId,
        sender: data.sender_id,
        recipient: 'SEOC-COMMAND',
        summary: data.content.slice(0, 50),
        payload: data
      });
      get().refreshNetworkState();
      return { queuedOffline: true, queueItem: q };
    }
  },

  acknowledgeMessage: async (messageId: string) => {
    const msgs = get().missionMessages.map(m => m.id === messageId ? { ...m, acknowledged: true } : m);
    set({ missionMessages: msgs });
    try {
      await api.acknowledgeMessage(messageId);
    } catch (e) {
      await offlineQueue.enqueue({
        kind: 'message_ack',
        summary: `Ack instruction ${messageId}`,
        payload: { message_id: messageId }
      });
      get().refreshNetworkState();
    }
  },

  updateFieldAlertDecision: async (alertId: string, decision: any) => {
    await api.updateFieldAlertDecision(alertId, decision);
    await get().fetchFieldAlerts();
    await get().fetchState();
  },

  triggerSimNewIncident: async () => {
    await api.simNewIncident();
    await get().fetchState();
  },

  triggerSimBlockRoad: async () => {
    await api.simBlockRoad();
    await get().fetchState();
  },

  triggerSimUnitUnavailable: async () => {
    await api.simUnitUnavailable();
    await get().fetchState();
  },

  triggerSimReduceCapacity: async () => {
    await api.simReduceHospitalCapacity();
    await get().fetchState();
  },

  triggerSimRestoreRoad: async () => {
    await api.simRestoreRoad();
    await get().fetchState();
  },

  triggerReset: async () => {
    await api.simResetScenario();
    set({ selectedIncidentId: null, selectedResourceId: null, evaluationResult: null });
    await get().fetchState();
  }
}));
