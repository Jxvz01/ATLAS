import { create } from 'zustand';
import { ScenarioState, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert } from '../types/atlas';
import { api } from '../services/api';

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
  
  fetchState: () => Promise<void>;
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

  fetchState: async () => {
    try {
      const data = await api.getScenarioState();
      set({ state: data, error: null });
      const currentSelected = get().selectedIncidentId;
      if (currentSelected && !get().isEvaluating) {
        get().evaluateIncident(currentSelected);
      }
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch ATLAS state' });
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
    await api.updateAssignment(assignmentId, status);
    await get().fetchState();
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
