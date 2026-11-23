# ATLAS Engineering Roadmap (Phases 1 — 9)

## Phase 1: Core Infrastructure, Incident Engine & Operational Data Foundation [COMPLETED]
- [x] Establish modular backend architecture (`domain`, `services`, `db`, `api/v1`).
- [x] Implement validated Incident domain model with coordinate and field guards.
- [x] Implement formal deterministic state machine with guard rules and reason constraints.
- [x] Multi-factor duplicate incident detection (spatial, temporal, categorical, token overlap).
- [x] Multi-report linking to canonical incident records preserving raw submissions.
- [x] Append-only audit logging and event tracking.
- [x] Role-based access control (RBAC) and caller attribution headers.
- [x] SQLite operational store with WAL mode and foreign keys.
- [x] 14 comprehensive unit and integration tests passing.
- [x] System documentation suite (`ATLAS_ARCHITECTURE.md`, `INCIDENT_ENGINE.md`, `API_REFERENCE.md`, `ROADMAP.md`).

---

## Phase 2: PostgreSQL / PostGIS Spatial Database Migration
- [ ] Implement database migrations using Alembic.
- [ ] Migrate SQLite operational store to PostgreSQL 16 + PostGIS.
- [ ] Convert Haversine distance queries to indexed spatial queries (`ST_DWithin`, `GIST`).
- [ ] Implement database connection pooling (asyncpg / SQLAlchemy async engine).
- [ ] Add spatial bounding box queries and polygon exclusion zones for road closures.

---

## Phase 3: Real-Time Event Bus & WebSocket Subscriptions
- [ ] Replace synchronous polling with WebSocket pub/sub feeds per channel (`/ws/incidents`, `/ws/dispatch`, `/ws/hospitals`).
- [ ] Event notification fanout via Redis Pub/Sub.
- [ ] Client auto-reconnect and state reconciliation protocols.
- [ ] Real-time incident updates streaming to Admin, Hospital, Rescuer, and Civilian interfaces.

---

## Phase 4: Autonomous Resource Allocation & Dispatch Optimization
- [ ] Capability-based matching engine optimization (multi-vehicle, specialized gear).
- [ ] Multi-incident vehicle routing with dynamic road blockage avoidance (Dijkstra / Contraction Hierarchies).
- [ ] Time-windowed ETA predictions incorporating terrain elevation and flooded segments.
- [ ] Automated staging area recommendations for reserve units.

---

## Phase 5: Hospital Emergency Intake & Patient Referral Engine
- [ ] Live bed inventory management (ICU, Trauma, General, Isolation) with optimistic concurrency locks.
- [ ] Real-time patient referral dispatch from field rescue units directly to triage-ready facilities.
- [ ] Ambulance transit telemetry and dynamic hospital diversion protocols when at critical capacity.

---

## Phase 6: Civilian Offline-First & Resilient Field Reporting
- [ ] Offline caching and queued sync in Civilian Mobile App using IndexedDB / Service Workers.
- [ ] SMS / low-bandwidth fallback reporting bridge for severed internet conditions.
- [ ] Mesh networking experiment for peer-to-peer civilian SOS relay in network dead zones.

---

## Phase 7: Automated Hazard & Satellite/Sensor Telemetry Ingestion
- [ ] Weather radar and flood level sensor ingestion pipeline (USGS / CWC / sensor APIs).
- [ ] GeoJSON hazard polygon overlays dynamically triggering automated zone evacuations.
- [ ] Drone reconnaissance image upload and metadata extraction.

---

## Phase 8: Operational Security, Audit Verification & Governance
- [ ] JWT / OAuth2 authentication provider integration with multi-factor authentication (MFA).
- [ ] Cryptographic hash-chaining of append-only audit events for forensic tamper resistance.
- [ ] Data privacy controls, PII masking for civilian phone numbers and names after incident closure.

---

## Phase 9: High-Availability Deployment & Disaster Recovery
- [ ] Docker Compose and Kubernetes deployment manifests.
- [ ] Geo-replicated read replicas across multi-region edge nodes.
- [ ] Chaos engineering drills: simulating total database failover and network partitions during disaster peaks.
