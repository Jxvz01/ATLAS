"""
Deterministic Incident Lifecycle State Machine.
Defines formal transitions, valid origins/destinations, guard conditions, and transition execution.
"""
from typing import Dict, Set, Optional, Tuple
from app.domain.enums import IncidentStatus, EventType, VerificationStatus
from app.domain.models import IncidentRecord, IncidentActor, IncidentEvent, utc_now_iso

# Formal transition graph: Origin -> Set of permitted next statuses
PERMITTED_TRANSITIONS: Dict[IncidentStatus, Set[IncidentStatus]] = {
    IncidentStatus.RECEIVED: {
        IncidentStatus.UNDER_REVIEW,
        IncidentStatus.VERIFIED,
        IncidentStatus.REJECTED,
        IncidentStatus.DUPLICATE,
        IncidentStatus.CANCELLED
    },
    IncidentStatus.UNDER_REVIEW: {
        IncidentStatus.VERIFIED,
        IncidentStatus.REJECTED,
        IncidentStatus.DUPLICATE,
        IncidentStatus.CANCELLED
    },
    IncidentStatus.VERIFIED: {
        IncidentStatus.ACTIVE,
        IncidentStatus.RESPONSE_IN_PROGRESS,
        IncidentStatus.RESOLVED,
        IncidentStatus.CANCELLED
    },
    IncidentStatus.ACTIVE: {
        IncidentStatus.RESPONSE_IN_PROGRESS,
        IncidentStatus.ON_SCENE,
        IncidentStatus.RESOLVED,
        IncidentStatus.CANCELLED
    },
    IncidentStatus.RESPONSE_IN_PROGRESS: {
        IncidentStatus.ON_SCENE,
        IncidentStatus.RESOLVED,
        IncidentStatus.ACTIVE, # Unit recall/re-queue
        IncidentStatus.CANCELLED
    },
    IncidentStatus.ON_SCENE: {
        IncidentStatus.RESOLVED,
        IncidentStatus.RESPONSE_IN_PROGRESS,
        IncidentStatus.CANCELLED
    },
    IncidentStatus.RESOLVED: {
        IncidentStatus.CLOSED,
        IncidentStatus.ACTIVE # Explicit reopen
    },
    IncidentStatus.CLOSED: {
        IncidentStatus.ACTIVE # Explicit reopen from closed
    },
    IncidentStatus.REJECTED: set(),
    IncidentStatus.DUPLICATE: set(),
    IncidentStatus.CANCELLED: {
        IncidentStatus.ACTIVE # Administrative reinstatement
    }
}

class IncidentLifecycleError(Exception):
    """Raised when an illegal transition or missing transition constraint is encountered."""
    pass

class IncidentStateMachine:
    @staticmethod
    def can_transition(current: IncidentStatus, target: IncidentStatus) -> bool:
        """Checks if a transition between two states is permitted in the lifecycle graph."""
        if current == target:
            return True
        allowed = PERMITTED_TRANSITIONS.get(current, set())
        return target in allowed

    @staticmethod
    def validate_transition(
        incident: IncidentRecord,
        target_status: IncidentStatus,
        actor: IncidentActor,
        reason: Optional[str] = None
    ) -> None:
        """Validates that a transition meets both graph permissions and business domain guards."""
        current_status = incident.status
        
        if current_status == target_status:
            return

        if not IncidentStateMachine.can_transition(current_status, target_status):
            raise IncidentLifecycleError(
                f"Illegal transition: Cannot move incident from '{current_status.value}' to '{target_status.value}'. "
                f"Permitted next states: {[s.value for s in PERMITTED_TRANSITIONS.get(current_status, set())]}"
            )

        # Guard: Reopening requires an explicit non-empty justification
        if current_status in [IncidentStatus.RESOLVED, IncidentStatus.CLOSED, IncidentStatus.CANCELLED] and target_status == IncidentStatus.ACTIVE:
            if not reason or len(reason.strip()) < 5:
                raise IncidentLifecycleError("Reopening an incident requires an explicit justification reason (min 5 chars).")

        # Guard: Resolving an incident requires a resolution summary
        if target_status == IncidentStatus.RESOLVED:
            if not reason or len(reason.strip()) < 3:
                raise IncidentLifecycleError("Resolving an incident requires resolution notes/details.")

        # Guard: Verification requires either verified status or active
        if target_status == IncidentStatus.VERIFIED:
            if incident.verification_status == VerificationStatus.DISPUTED:
                raise IncidentLifecycleError("Cannot verify a disputed incident without resolving dispute review first.")

    @staticmethod
    def apply_transition(
        incident: IncidentRecord,
        target_status: IncidentStatus,
        actor: IncidentActor,
        reason: Optional[str] = None,
        context: Optional[dict] = None
    ) -> Tuple[IncidentRecord, IncidentEvent]:
        """Applies validated transition, mutates timestamp & status, and returns an immutable event record."""
        IncidentStateMachine.validate_transition(incident, target_status, actor, reason)
        
        prev_status_str = incident.status.value
        now_iso = utc_now_iso()
        
        # Mutate incident record
        incident.status = target_status
        incident.updated_at = now_iso
        
        if target_status == IncidentStatus.VERIFIED:
            incident.verification_status = VerificationStatus.VERIFIED
            incident.verified_at = now_iso
            incident.verified_by = actor.name

        elif target_status == IncidentStatus.RESOLVED:
            incident.resolution_details = reason
            incident.resolved_at = now_iso

        elif target_status == IncidentStatus.ACTIVE and prev_status_str in ["RESOLVED", "CLOSED", "CANCELLED"]:
            # Reset resolution fields upon reopen
            incident.resolution_details = f"Reopened by {actor.name}: {reason}"
            incident.resolved_at = None

        # Create audit event
        event = IncidentEvent(
            id=f"EVT-{incident.id}-{int(datetime_to_epoch(now_iso))}",
            event_type=EventType.STATUS_TRANSITION,
            entity_id=incident.id,
            actor=actor,
            previous_state=prev_status_str,
            new_state=target_status.value,
            reason=reason,
            context=context or {},
            created_at=now_iso
        )
        
        return incident, event

def datetime_to_epoch(iso_str: str) -> float:
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.timestamp() * 1000
    except Exception:
        import time
        return time.time() * 1000
