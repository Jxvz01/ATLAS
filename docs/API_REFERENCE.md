# ATLAS API Reference (v1)

Base Path: `/api/v1`

## 1. Authentication & Caller Headers
Requests should include actor headers to enable role-based authorization and complete audit logging:

| Header | Type | Description | Default |
|---|---|---|---|
| `X-Actor-ID` | String | Unique ID of user/service | `system` |
| `X-Actor-Name` | String | Display name of caller | `System Automated` |
| `X-Actor-Role` | String | `admin`, `dispatcher`, `rescuer`, `hospital_staff`, `civilian`, `system` | `system` |

---

## 2. Endpoints

### 2.1 Health & Summary

#### `GET /api/v1/health`
Checks service health and operational database connectivity.
- **Roles:** Any
- **Response 200:**
```json
{
  "status": "operational",
  "version": "1.0.0",
  "database": "sqlite_operational_connected",
  "timestamp": "2026-11-23T13:00:00Z"
}
```

#### `GET /api/v1/operations/summary`
Returns aggregate system KPI metrics.
- **Roles:** Any
- **Response 200:**
```json
{
  "total_incidents": 14,
  "active_incidents": 6,
  "verified_incidents": 3,
  "resolved_incidents": 5,
  "critical_priority_incidents": 2,
  "total_reports": 28,
  "total_events": 94
}
```

---

### 2.2 Incident Ingestion & Management

#### `POST /api/v1/reports`
Submits a raw citizen or field report. Automatically computes duplicate candidates.
- **Roles:** Any (civilian, rescuer, dispatcher, admin)
- **Request Body:**
```json
{
  "title": "Flash flood near market",
  "description": "Water rising above car tires near vegetable market",
  "type": "flooding",
  "latitude": 12.3118,
  "longitude": 76.6529,
  "location_name": "Devaraja Market, Mysuru",
  "reporter_name": "Citizen Ravi",
  "reporter_phone": "+91 9876543210",
  "source": "citizen_app",
  "affected_people_count": 4,
  "medical_assistance_needed": false
}
```
- **Response 201:** Returns created `IncidentRecord` and list of `DuplicateCandidate` objects.

#### `GET /api/v1/incidents`
Lists incidents with optional filtering.
- **Query Parameters:**
  - `status`: Filter by `IncidentStatus`
  - `type`: Filter by `IncidentType`
  - `priority`: Filter by `PriorityLevel`
  - `limit`: Default 50
  - `offset`: Default 0
- **Response 200:** `List[IncidentRecord]`

#### `GET /api/v1/incidents/{incident_id}`
Retrieves a single incident by ID.
- **Response 200:** `IncidentRecord`
- **Response 404:** Incident not found.

#### `GET /api/v1/incidents/{incident_id}/events`
Returns complete append-only audit trail for an incident.
- **Response 200:** `List[IncidentEvent]`

#### `GET /api/v1/incidents/{incident_id}/reports`
Returns all raw reports linked to this incident.
- **Response 200:** `List[IncidentReport]`

---

### 2.3 Lifecycle State Transitions

#### `POST /api/v1/incidents/{incident_id}/transition`
Performs an arbitrary lifecycle transition validated against the formal state machine.
- **Roles:** `dispatcher`, `admin`, `rescuer`
- **Request Body:**
```json
{
  "target_status": "response_in_progress",
  "reason": "Rescue Boat Team R-04 deployed"
}
```
- **Response 200:** Updated `IncidentRecord`
- **Response 422:** Illegal transition attempted.

#### `POST /api/v1/incidents/{incident_id}/verify`
Verifies an incident and sets its operational priority.
- **Roles:** `dispatcher`, `admin`
- **Request Body:**
```json
{
  "priority": "high",
  "notes": "Verified by field observer"
}
```

#### `POST /api/v1/incidents/{incident_id}/resolve`
Marks an active incident as resolved. Requires resolution notes.
- **Roles:** `dispatcher`, `admin`, `rescuer`
- **Request Body:**
```json
{
  "resolution_notes": "All stranded civilians evacuated to community shelter"
}
```

#### `POST /api/v1/incidents/{incident_id}/reopen`
Reopens a resolved or closed incident. Requires documented justification.
- **Roles:** `dispatcher`, `admin`
- **Request Body:**
```json
{
  "reason": "Water levels surged again after dam sluice gate opened"
}
```

#### `POST /api/v1/incidents/{incident_id}/link-report`
Links another raw report to an existing incident.
- **Roles:** `dispatcher`, `admin`
- **Request Body:**
```json
{
  "report_id": "REP-2026-0042"
}
```
