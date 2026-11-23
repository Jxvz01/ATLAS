"""
SQLite Persistent Store for ATLAS Disaster Response Network.
Enforces foreign keys, indexes, transactions, schema migrations, and JSON serialization.
Provides an enterprise foundation that cleanly ports to PostgreSQL / PostGIS.
"""
import sqlite3
import json
import os
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timezone
from app.domain.models import IncidentRecord, IncidentReport, IncidentEvent, IncidentActor, utc_now_iso
from app.domain.enums import IncidentType, IncidentCategory, IncidentStatus, VerificationStatus, PriorityLevel, ReportSource, ActorRole, EventType

DEFAULT_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "atlas_operational.db"))

class SQLiteOperationalStore:
    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_schema()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        return conn

    def _init_schema(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            
            # Incidents Table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                category TEXT NOT NULL,
                severity INTEGER NOT NULL CHECK (severity BETWEEN 1 AND 5),
                urgency INTEGER NOT NULL CHECK (urgency BETWEEN 1 AND 5),
                confidence REAL NOT NULL CHECK (confidence BETWEEN 0.0 AND 1.0),
                priority_score REAL NOT NULL,
                priority_level TEXT NOT NULL,
                status TEXT NOT NULL,
                verification_status TEXT NOT NULL,
                latitude REAL NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
                longitude REAL NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
                location_description TEXT,
                source TEXT NOT NULL,
                source_reference TEXT,
                people_affected INTEGER NOT NULL DEFAULT 1 CHECK (people_affected >= 0),
                casualties INTEGER NOT NULL DEFAULT 0 CHECK (casualties >= 0),
                requiring_rescue INTEGER NOT NULL DEFAULT 0,
                requiring_medical INTEGER NOT NULL DEFAULT 0,
                description TEXT NOT NULL,
                required_capabilities TEXT, -- JSON array
                hazard_information TEXT,
                reported_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                verified_at TEXT,
                verified_by TEXT,
                assigned_resources TEXT, -- JSON array
                resolution_details TEXT,
                resolved_at TEXT
            );
            """)

            # Indexes on Incidents
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_type ON incidents(type);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_coords ON incidents(latitude, longitude);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);")

            # Incident Reports Table (Supports multiple reports per incident, preserving raw submissions)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS incident_reports (
                id TEXT PRIMARY KEY,
                incident_id TEXT,
                source TEXT NOT NULL,
                reporter_reference TEXT,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                location_description TEXT,
                emergency_type TEXT NOT NULL,
                description TEXT NOT NULL,
                people_affected INTEGER NOT NULL DEFAULT 1,
                casualties INTEGER NOT NULL DEFAULT 0,
                requires_rescue INTEGER NOT NULL DEFAULT 0,
                requires_medical INTEGER NOT NULL DEFAULT 0,
                evidence_references TEXT, -- JSON array
                verification_status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE SET NULL
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_incident_id ON incident_reports(incident_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_created_at ON incident_reports(created_at);")

            # Incident Events Table (Append-only audit trail)
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS incident_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                actor_name TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                previous_state TEXT,
                new_state TEXT,
                reason TEXT,
                context TEXT, -- JSON dict
                created_at TEXT NOT NULL
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_entity_id ON incident_events(entity_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_type ON incident_events(event_type);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_events_created ON incident_events(created_at);")

            conn.commit()

    # --- Incidents CRUD ---
    def insert_incident(self, incident: IncidentRecord) -> IncidentRecord:
        with self.get_connection() as conn:
            conn.execute("""
            INSERT INTO incidents (
                id, type, category, severity, urgency, confidence, priority_score, priority_level,
                status, verification_status, latitude, longitude, location_description, source,
                source_reference, people_affected, casualties, requiring_rescue, requiring_medical,
                description, required_capabilities, hazard_information, reported_at, created_at,
                updated_at, verified_at, verified_by, assigned_resources, resolution_details, resolved_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                incident.id, incident.type.value, incident.category.value, incident.severity,
                incident.urgency, incident.confidence, incident.priority_score, incident.priority_level.value,
                incident.status.value, incident.verification_status.value, incident.latitude, incident.longitude,
                incident.location_description, incident.source.value, incident.source_reference,
                incident.people_affected, incident.casualties, incident.requiring_rescue, incident.requiring_medical,
                incident.description, json.dumps(incident.required_capabilities), incident.hazard_information,
                incident.reported_at, incident.created_at, incident.updated_at, incident.verified_at,
                incident.verified_by, json.dumps(incident.assigned_resources), incident.resolution_details,
                incident.resolved_at
            ))
            conn.commit()
        return incident

    def update_incident(self, incident: IncidentRecord) -> IncidentRecord:
        with self.get_connection() as conn:
            conn.execute("""
            UPDATE incidents SET
                type = ?, category = ?, severity = ?, urgency = ?, confidence = ?,
                priority_score = ?, priority_level = ?, status = ?, verification_status = ?,
                latitude = ?, longitude = ?, location_description = ?, source = ?,
                source_reference = ?, people_affected = ?, casualties = ?, requiring_rescue = ?,
                requiring_medical = ?, description = ?, required_capabilities = ?,
                hazard_information = ?, updated_at = ?, verified_at = ?, verified_by = ?,
                assigned_resources = ?, resolution_details = ?, resolved_at = ?
            WHERE id = ?;
            """, (
                incident.type.value, incident.category.value, incident.severity,
                incident.urgency, incident.confidence, incident.priority_score, incident.priority_level.value,
                incident.status.value, incident.verification_status.value, incident.latitude, incident.longitude,
                incident.location_description, incident.source.value, incident.source_reference,
                incident.people_affected, incident.casualties, incident.requiring_rescue, incident.requiring_medical,
                incident.description, json.dumps(incident.required_capabilities), incident.hazard_information,
                incident.updated_at, incident.verified_at, incident.verified_by, json.dumps(incident.assigned_resources),
                incident.resolution_details, incident.resolved_at, incident.id
            ))
            conn.commit()
        return incident

    def get_incident(self, incident_id: str) -> Optional[IncidentRecord]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM incidents WHERE id = ?;", (incident_id,)).fetchone()
            if not row:
                return None
            return self._row_to_incident(row)

    def list_incidents(
        self,
        status: Optional[str] = None,
        incident_type: Optional[str] = None,
        severity_min: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[IncidentRecord], int]:
        query = "SELECT * FROM incidents WHERE 1=1"
        count_query = "SELECT COUNT(*) FROM incidents WHERE 1=1"
        params: List[Any] = []

        if status:
            query += " AND status = ?"
            count_query += " AND status = ?"
            params.append(status)
        if incident_type:
            query += " AND type = ?"
            count_query += " AND type = ?"
            params.append(incident_type)
        if severity_min is not None:
            query += " AND severity >= ?"
            count_query += " AND severity >= ?"
            params.append(severity_min)

        with self.get_connection() as conn:
            total = conn.execute(count_query, params).fetchone()[0]
            
            query += " ORDER BY priority_score DESC, created_at DESC LIMIT ? OFFSET ?;"
            paginated_params = params + [limit, offset]
            rows = conn.execute(query, paginated_params).fetchall()
            
            incidents = [self._row_to_incident(r) for r in rows]
            return incidents, total

    def _row_to_incident(self, row: sqlite3.Row) -> IncidentRecord:
        return IncidentRecord(
            id=row["id"],
            type=IncidentType(row["type"]),
            category=IncidentCategory(row["category"]),
            severity=row["severity"],
            urgency=row["urgency"],
            confidence=row["confidence"],
            priority_score=row["priority_score"],
            priority_level=PriorityLevel(row["priority_level"]),
            status=IncidentStatus(row["status"]),
            verification_status=VerificationStatus(row["verification_status"]),
            latitude=row["latitude"],
            longitude=row["longitude"],
            location_description=row["location_description"] or "",
            source=ReportSource(row["source"]),
            source_reference=row["source_reference"],
            people_affected=row["people_affected"],
            casualties=row["casualties"],
            requiring_rescue=row["requiring_rescue"],
            requiring_medical=row["requiring_medical"],
            description=row["description"],
            required_capabilities=json.loads(row["required_capabilities"] or "[]"),
            hazard_information=row["hazard_information"],
            reported_at=row["reported_at"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            verified_at=row["verified_at"],
            verified_by=row["verified_by"],
            assigned_resources=json.loads(row["assigned_resources"] or "[]"),
            resolution_details=row["resolution_details"],
            resolved_at=row["resolved_at"]
        )

    # --- Reports CRUD ---
    def insert_report(self, report: IncidentReport) -> IncidentReport:
        with self.get_connection() as conn:
            conn.execute("""
            INSERT INTO incident_reports (
                id, incident_id, source, reporter_reference, latitude, longitude,
                location_description, emergency_type, description, people_affected,
                casualties, requires_rescue, requires_medical, evidence_references,
                verification_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                report.id, report.incident_id, report.source.value, report.reporter_reference,
                report.latitude, report.longitude, report.location_description,
                report.emergency_type.value, report.description, report.people_affected,
                report.casualties, 1 if report.requires_rescue else 0,
                1 if report.requires_medical else 0, json.dumps(report.evidence_references),
                report.verification_status.value, report.created_at
            ))
            conn.commit()
        return report

    def get_report(self, report_id: str) -> Optional[IncidentReport]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM incident_reports WHERE id = ?;", (report_id,)).fetchone()
            if not row:
                return None
            return self._row_to_report(row)

    def list_reports_for_incident(self, incident_id: str) -> List[IncidentReport]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM incident_reports WHERE incident_id = ? ORDER BY created_at DESC;", (incident_id,)).fetchall()
            return [self._row_to_report(r) for r in rows]

    def _row_to_report(self, row: sqlite3.Row) -> IncidentReport:
        return IncidentReport(
            id=row["id"],
            incident_id=row["incident_id"],
            source=ReportSource(row["source"]),
            reporter_reference=row["reporter_reference"],
            latitude=row["latitude"],
            longitude=row["longitude"],
            location_description=row["location_description"],
            emergency_type=IncidentType(row["emergency_type"]),
            description=row["description"],
            people_affected=row["people_affected"],
            casualties=row["casualties"],
            requires_rescue=bool(row["requires_rescue"]),
            requires_medical=bool(row["requires_medical"]),
            evidence_references=json.loads(row["evidence_references"] or "[]"),
            verification_status=VerificationStatus(row["verification_status"]),
            created_at=row["created_at"]
        )

    # --- Events Audit Trail ---
    def record_event(self, event: IncidentEvent) -> IncidentEvent:
        with self.get_connection() as conn:
            conn.execute("""
            INSERT INTO incident_events (
                id, event_type, entity_id, actor_id, actor_name, actor_role,
                previous_state, new_state, reason, context, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                event.id, event.event_type.value, event.entity_id,
                event.actor.id, event.actor.name, event.actor.role.value,
                event.previous_state, event.new_state, event.reason,
                json.dumps(event.context), event.created_at
            ))
            conn.commit()
        return event

    def list_events_for_incident(self, incident_id: str) -> List[IncidentEvent]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM incident_events WHERE entity_id = ? ORDER BY created_at ASC;", (incident_id,)).fetchall()
            return [self._row_to_event(r) for r in rows]

    def _row_to_event(self, row: sqlite3.Row) -> IncidentEvent:
        return IncidentEvent(
            id=row["id"],
            event_type=EventType(row["event_type"]),
            entity_id=row["entity_id"],
            actor=IncidentActor(
                id=row["actor_id"],
                name=row["actor_name"],
                role=ActorRole(row["actor_role"])
            ),
            previous_state=row["previous_state"],
            new_state=row["new_state"],
            reason=row["reason"],
            context=json.loads(row["context"] or "{}"),
            created_at=row["created_at"]
        )

# Global singleton persistent store
db_store = SQLiteOperationalStore()
