import axios from 'axios';
import { ScenarioState, Incident, Resource, Hospital, Assignment, RoadBlockage, Alert, IncomingPatient, Shelter, FieldAlert, MissionMessage } from '../types/atlas';
import { networkMonitor } from './networkMonitor';

const DEFAULT_API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000/api';

export function getApiBase(): string {
  return localStorage.getItem('atlas_api_base') || DEFAULT_API_BASE;
}

export function setApiBase(url: string): void {
  const cleaned = url.trim().replace(/\/+$/, '');
  if (cleaned) {
    localStorage.setItem('atlas_api_base', cleaned);
  } else {
    localStorage.removeItem('atlas_api_base');
  }
}

// Configure resilient HTTP defaults for degraded 2G/offline conditions
axios.defaults.timeout = 12000;

axios.interceptors.request.use((config) => {
  const base = getApiBase();
  if (config.url && config.url.startsWith('http://localhost:8000/api')) {
    config.url = config.url.replace('http://localhost:8000/api', base);
  }
  (config as any)._startedAt = performance.now();
  return config;
});

axios.interceptors.response.use(
  (response) => {
    const started = (response.config as any)?._startedAt;
    if (started) {
      networkMonitor.recordSuccess(Math.round(performance.now() - started));
    }
    return response;
  },
  (error) => {
    networkMonitor.recordFailure();
    return Promise.reject(error);
  }
);

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

  // Medical Referrals
  getReferrals: async (hospitalId?: string): Promise<IncomingPatient[]> => {
    const params = hospitalId ? { hospital_id: hospitalId } : {};
    const res = await axios.get(`${API_BASE}/referrals`, { params });
    return res.data;
  },

  createReferral: async (data: {
    incident_id: string;
    hospital_id: string;
    resource_id: string;
    estimated_arrival_minutes?: number;
    estimated_patient_count?: number;
    patient_condition: string;
    severity?: string;
    treatment_required?: string;
  }): Promise<IncomingPatient> => {
    const res = await axios.post(`${API_BASE}/referrals`, data);
    return res.data;
  },

  updateReferral: async (referralId: string, data: {
    status: string;
    estimated_arrival_minutes?: number;
  }): Promise<IncomingPatient> => {
    const res = await axios.patch(`${API_BASE}/referrals/${referralId}`, data);
    return res.data;
  },

  // Shelters
  getShelters: async (): Promise<Shelter[]> => {
    const res = await axios.get(`${API_BASE}/shelters`);
    return res.data;
  },

  updateShelter: async (shelterId: string, data: Partial<Shelter>): Promise<Shelter> => {
    const res = await axios.patch(`${API_BASE}/shelters/${shelterId}`, data);
    return res.data;
  },

  // Field-to-Command Alerts & Mission Communications
  getFieldAlerts: async (rescuerId?: string): Promise<FieldAlert[]> => {
    const res = await axios.get(`${API_BASE}/field-alerts`, { params: rescuerId ? { rescuer_id: rescuerId } : {} });
    return res.data;
  },

  submitFieldAlert: async (data: {
    rescuer_id: string;
    rescuer_name: string;
    active_assignment_id?: string;
    original_incident_id?: string;
    emergency_type: string;
    description: string;
    latitude?: number;
    longitude?: number;
    location_description?: string;
    people_affected?: number;
    casualties?: number;
    requires_rescue?: boolean;
    requires_medical?: boolean;
    hazard_info?: string;
    urgency?: string;
  }): Promise<{ alert: FieldAlert; incident: Incident }> => {
    const res = await axios.post(`${API_BASE}/field-alerts`, data);
    return res.data;
  },

  updateFieldAlertDecision: async (alertId: string, data: {
    status: string;
    command_decision: string;
    decision_reason?: string;
  }) => {
    const res = await axios.patch(`${API_BASE}/field-alerts/${alertId}/decision`, data);
    return res.data;
  },

  getMissionMessages: async (missionId: string): Promise<MissionMessage[]> => {
    const res = await axios.get(`${API_BASE}/missions/${missionId}/messages`);
    return res.data;
  },

  sendMissionMessage: async (missionId: string, data: {
    sender_id: string;
    sender_name: string;
    sender_role: string;
    content: string;
    priority?: string;
    field_alert_id?: string;
    message_type?: string;
  }): Promise<MissionMessage> => {
    const res = await axios.post(`${API_BASE}/missions/${missionId}/messages`, data);
    return res.data;
  },

  acknowledgeMessage: async (messageId: string) => {
    const res = await axios.post(`${API_BASE}/messages/${messageId}/acknowledge`);
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
  },

  // ATLAS 2.0: Groq AI Intelligence Layer (Advisory Only)
  getAiStatus: async () => {
    const res = await axios.get(`${API_BASE}/ai/status`);
    return res.data;
  },

  aiAssessIncident: async (incidentId: string) => {
    const res = await axios.post(`${API_BASE}/ai/assess-incident/${incidentId}`, {}, { timeout: 20000 });
    return res.data;
  },

  aiSummarizeIncident: async (incidentId: string) => {
    const res = await axios.post(`${API_BASE}/ai/summarize-incident/${incidentId}`, {}, { timeout: 20000 });
    return res.data;
  },

  aiOperationalBriefing: async () => {
    const res = await axios.post(`${API_BASE}/ai/briefing`, {}, { timeout: 20000 });
    return res.data;
  },

  aiAnalyzeFieldReport: async (data: {
    incident_id: string;
    resource_id?: string;
    casualties: number;
    assessment: string;
    road_condition?: string;
    notes?: string;
  }) => {
    const res = await axios.post(`${API_BASE}/ai/analyze-field-report`, data, { timeout: 20000 });
    return res.data;
  },

  aiOperationalQuery: async (question: string) => {
    const res = await axios.post(`${API_BASE}/ai/query`, { question }, { timeout: 20000 });
    return res.data;
  },

  aiPredictNextImpact: async () => {
    const res = await axios.post(`${API_BASE}/ai/predict-next-impact`, {}, { timeout: 25000 });
    return res.data;
  },

  // ATLAS 2.0: Open-Source Geographic, Satellite Imagery & Hazard Data
  getOpenDataOverview: async (includeOsm: boolean = false) => {
    const res = await axios.get(`${API_BASE}/open-data/overview`, { params: { include_osm: includeOsm }, timeout: 12000 });
    return res.data;
  },

  getOsmInfrastructure: async () => {
    const res = await axios.get(`${API_BASE}/open-data/osm-infrastructure`, { timeout: 12000 });
    return res.data;
  },

  getImageryLayers: async () => {
    const res = await axios.get(`${API_BASE}/open-data/imagery-layers`);
    return res.data;
  },

  getGibsLayers: async (date?: string) => {
    const res = await axios.get(`${API_BASE}/open-data/gibs-layers`, { params: date ? { date } : {} });
    return res.data;
  },

  getEoScenes: async (lat = 12.2958, lon = 76.6394, maxCloud = 100) => {
    const res = await axios.get(`${API_BASE}/open-data/eo-scenes`, { params: { lat, lon, max_cloud: maxCloud }, timeout: 12000 });
    return res.data;
  },

  getEoStatus: async () => {
    const res = await axios.get(`${API_BASE}/open-data/eo-status`);
    return res.data;
  }
};
