export interface Incident {
  id: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  severity: number;
  urgency: number;
  confidence: number;
  affected_population: number;
  vulnerability: number;
  priority_score: number;
  priority_level: 'Critical' | 'High' | 'Medium' | 'Low';
  status: 'Active' | 'Assigned' | 'In Progress' | 'Resolved' | 'Flagged';
  source: string;
  required_capabilities: string[];
  created_at: string;
  updated_at: string;
}

export interface Resource {
  id: string;
  name: string;
  type: 'Boat Team' | 'Rescue Team' | 'Ambulance' | 'Medical Unit';
  latitude: number;
  longitude: number;
  capabilities: string[];
  status: 'Available' | 'Assigned' | 'En route' | 'On scene' | 'Returning' | 'Unavailable';
  capacity: number;
  current_assignment_id: string | null;
  updated_at: string;
}

export interface Hospital {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  total_beds: number;
  available_beds: number;
  icu_capacity: number;
  emergency_capacity: number;
  available_medical_personnel: number;
  operational_status: 'Operational' | 'Limited capacity' | 'Critical' | 'Closed';
  updated_at: string;
}

export interface Assignment {
  id: string;
  incident_id: string;
  resource_id: string;
  route_geometry?: [number, number][]; // [lon, lat]
  route_distance_km: number;
  assignment_status: 'Dispatched' | 'Acknowledged' | 'En Route' | 'On Scene' | 'Completed' | 'Canceled';
  explanation: string;
  assigned_at: string;
  updated_at: string;
}

export interface RoadBlockage {
  id: string;
  road_id: string;
  latitude: number;
  longitude: number;
  reason: string;
  status: 'Active' | 'Cleared';
  avoid_radius_km: number;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  event_type: string;
  message: string;
  entity_id?: string;
  created_at: string;
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: 'Critical' | 'Warning' | 'Advisory';
  target: string;
  created_at: string;
}

export interface HazardZone {
  id: string;
  name: string;
  type: string;
  risk_level: string;
  coordinates: [number, number][];
}

export interface IncomingPatient {
  id: string;
  incident_id: string;
  hospital_id: string;
  resource_id: string;
  estimated_arrival_minutes: number;
  estimated_patient_count: number;
  patient_condition: string;
  status: 'En Route' | 'Arrived' | 'Admitted';
}

export interface ScenarioMetrics {
  active_incidents: number;
  critical_incidents: number;
  available_rescue_units: number;
  active_rescue_units: number;
  operational_hospitals: number;
  estimated_affected_people: number;
  pending_incidents: number;
}

export interface ScenarioState {
  scenario_name: string;
  disclaimer: string;
  center: [number, number];
  zoom: number;
  metrics: ScenarioMetrics;
  incidents: Incident[];
  resources: Resource[];
  hospitals: Hospital[];
  assignments: Assignment[];
  road_blockages: RoadBlockage[];
  hazards: HazardZone[];
  alerts: Alert[];
  incoming_patients: IncomingPatient[];
  activity_logs: ActivityLog[];
}
