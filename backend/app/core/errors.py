from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ServiceError(Exception):
    error_code: str
    message: str
    status_code: int
    details: dict[str, str] = field(default_factory=dict)

    def to_payload(self) -> dict[str, object]:
        payload: dict[str, object] = {
            "error_code": self.error_code,
            "message": self.message,
        }
        if self.details:
            payload["details"] = self.details
        return payload
