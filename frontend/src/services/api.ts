import axios from 'axios';
import { ScenarioState, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert } from '../types/atlas';

const API_BASE = 'http://localhost:8000/api';

export const api = {
  getScenarioState: async (): Promise<ScenarioState> => {
    const res = await axios.get(`${API_BASE}/scenario/state`);
    return res.data;
  },

  createIncident: async (data: {
    type: string;
    description: string;
    latitude: number;
    longitude: number;
    severity?: number;
    urgency?: number;
    affected_population?: number;
    source?: string;
  }): Promise<Incident> => {
    const res = await axios.post(`${API_BASE}/incidents`, data);
    return res.data;
  },

  updateIncident: async (id: string, updates: Partial<Incident>): Promise<Incident> => {
    const res = await axios.patch(`${API_BASE}/incidents/${id}`, updates);
    return res.data;
  },

  evaluateIncident: async (incidentId: string) => {
    const res = await axios.post(`${API_BASE}/engine/evaluate-incident/${incidentId}`);
    return res.data;
  },

  recomputeAllocations: async () => {
    const res = await axios.post(`${API_BASE}/engine/recompute`);
    return res.data;
  },

  assignResource: async (incidentId: string, resourceId: string, explanation?: string): Promise<Assignment> => {
    const res = await axios.post(`${API_BASE}/assignments`, {
      incident_id: incidentId,
      resource_id: resourceId,
      explanation
    });
    return res.data;
  },

  updateAssignment: async (assignmentId: string, status: string): Promise<Assignment> => {
    const res = await axios.patch(`${API_BASE}/assignments/${assignmentId}`, {
      assignment_status: status
    });
    return res.data;
  },

  updateResourceStatus: async (resourceId: string, status: string): Promise<Resource> => {
    const res = await axios.patch(`${API_BASE}/resources/${resourceId}`, { status });
    return res.data;
  },

  updateHospitalCapacity: async (hospitalId: string, data: Partial<Hospital>): Promise<Hospital> => {
    const res = await axios.patch(`${API_BASE}/hospitals/${hospitalId}`, data);
    return res.data;
  },

  reportBlockage: async (roadId: string, lat: number, lon: number, reason: string): Promise<RoadBlockage> => {
    const res = await axios.post(`${API_BASE}/blockages`, {
      road_id: roadId,
      latitude: lat,
      longitude: lon,
      reason
    });
    return res.data;
  },

  clearBlockage: async (blockageId: string) => {
    const res = await axios.delete(`${API_BASE}/blockages/${blockageId}`);
    return res.data;
  },

  submitFieldReport: async (data: {
    incident_id: string;
    resource_id: string;
    casualties: number;
    assessment: string;
    road_condition?: string;
    notes?: string;
  }) => {
    const res = await axios.post(`${API_BASE}/field-reports`, data);
    return res.data;
  },

  // Simulation Controls
  simNewIncident: async () => {
    const res = await axios.post(`${API_BASE}/simulation/new-incident`);
    return res.data;
  },

  simBlockRoad: async () => {
    const res = await axios.post(`${API_BASE}/simulation/block-road`);
    return res.data;
  },

  simUnitUnavailable: async () => {
    const res = await axios.post(`${API_BASE}/simulation/unit-unavailable`);
    return res.data;
  },

  simReduceHospitalCapacity: async () => {
    const res = await axios.post(`${API_BASE}/simulation/hospital-capacity`);
    return res.data;
  },

  simRestoreRoad: async () => {
    const res = await axios.post(`${API_BASE}/simulation/restore-road`);
    return res.data;
  },

  simResetScenario: async () => {
    const res = await axios.post(`${API_BASE}/simulation/reset`);
    return res.data;
  }
};
