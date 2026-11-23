"""
FastAPI Security & Actor Dependency Provider.
Extracts authenticated actor credentials, roles, and identity from request headers.
Enforces role-based permissions at the API layer.
"""
from fastapi import Header, HTTPException, status
from typing import Optional
from app.domain.models import IncidentActor
from app.domain.enums import ActorRole

def get_current_actor(
    x_actor_id: Optional[str] = Header("anonymous-user", alias="X-Actor-ID"),
    x_actor_name: Optional[str] = Header("Anonymous Civilian", alias="X-Actor-Name"),
    x_actor_role: Optional[str] = Header("civilian", alias="X-Actor-Role")
) -> IncidentActor:
    """
    Extracts caller actor from request headers.
    Defaults to civilian if not specified.
    """
    try:
        role = ActorRole(x_actor_role.lower())
    except ValueError:
        role = ActorRole.CIVILIAN

    return IncidentActor(
        id=x_actor_id,
        name=x_actor_name,
        role=role
    )

def require_admin_or_commander(
    actor: IncidentActor
) -> IncidentActor:
    """Enforces that only admin or incident commanders can perform the operation."""
    if actor.role not in [ActorRole.ADMIN, ActorRole.INCIDENT_COMMANDER, ActorRole.SYSTEM]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Role '{actor.role.value}' is not authorized for this operation."
        )
    return actor
