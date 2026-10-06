"""Device-side session and read-only capability authority for the sample shell."""

import time
from uuid import uuid4

from device.adapters.sample import PROTOCOL_VERSION, SAMPLE_MARKERS, SampleBackend


class ReadOnlyOperationError(Exception):
    """No action can be accepted by the current sample controller."""

    code = "read_only"


class ReadonlyController:
    def __init__(self, backend: SampleBackend) -> None:
        self._backend = backend
        self._session_id = str(uuid4())
        self._started_monotonic = time.monotonic()
        self._sequence = 0

    def _identity(self) -> dict:
        return {
            "protocol_version": PROTOCOL_VERSION,
            **SAMPLE_MARKERS,
            "device_id": None,
            "session_id": self._session_id,
            "read_only": True,
            "mode": "sample_read_only",
            "capabilities": {
                "telemetry": True,
                "control": False,
                "calibration": False,
                "recording": False,
                "runtime": False,
            },
        }

    def info(self) -> dict:
        return {**self._identity(), "joint_mapping": self._backend.joint_mapping()}

    def read_state(self) -> dict:
        joints = self._backend.read_sample()
        sampled_at_unix_s = time.time()
        sampled_monotonic = time.monotonic()
        self._sequence += 1
        return {
            **self._identity(),
            "type": "state",
            "sequence": self._sequence,
            "sampled_at_unix_s": sampled_at_unix_s,
            "monotonic_elapsed_s": max(0.0, sampled_monotonic - self._started_monotonic),
            "age_ms": max(0.0, (time.monotonic() - sampled_monotonic) * 1000),
            "joints": joints,
        }

    def reject_operation(self, operation: str | None = None) -> None:
        raise ReadOnlyOperationError("This sample controller does not support any command or write operation.")

