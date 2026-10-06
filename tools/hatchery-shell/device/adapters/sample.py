"""Load protocol fixtures without importing serial drivers or frontend code."""

from copy import deepcopy
import json
import math
from pathlib import Path

PROTOCOL_VERSION = "hatchery-shell/0"
SAMPLE_MARKERS = {"sample": True, "fake": True, "simulated": False, "source": "sample"}
JOINT_VALUE_FIELDS = ("position_ticks", "goal_ticks", "load_raw", "voltage_v", "temperature_c")


def _integer(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


class SampleBackend:
    """An immutable fixture source, never a hardware or control backend."""

    def __init__(self, protocol_directory: Path) -> None:
        with (protocol_directory / "mappings" / "joints.json").open(encoding="utf-8") as handle:
            mapping = json.load(handle)
        with (protocol_directory / "fixtures" / "sample-state.json").open(encoding="utf-8") as handle:
            fixture = json.load(handle)
        self._validate_mapping(mapping)
        self._validate_fixture(fixture, mapping["joints"])
        self._joint_mapping = sorted(mapping["joints"], key=lambda joint: joint["display_index"])
        by_id = {joint["joint_id"]: joint for joint in fixture["joints"]}
        self._joints = [by_id[joint["joint_id"]] for joint in self._joint_mapping]

    @staticmethod
    def _validate_mapping(mapping: object) -> None:
        if not isinstance(mapping, dict) or mapping.get("protocol_version") != PROTOCOL_VERSION:
            raise ValueError("unsupported joint mapping protocol version")
        joints = mapping.get("joints")
        if not isinstance(joints, list) or len(joints) != 15 or not all(isinstance(j, dict) for j in joints):
            raise ValueError("joint mapping must contain all 15 physical joints")
        ids = [joint.get("joint_id") for joint in joints]
        if not all(_integer(value) for value in ids) or len(set(ids)) != 15 or 34 not in ids:
            raise ValueError("joint IDs must be unique and include mouth 34")
        for field in ("display_index", "runtime_index"):
            indices = [joint.get(field) for joint in joints]
            if not all(_integer(value) for value in indices) or sorted(indices) != list(range(15)):
                raise ValueError(f"{field} must be an independent permutation of 0..14")
        policy = [joint.get("policy_index") for joint in joints if joint["joint_id"] != 34]
        mouth = next(joint for joint in joints if joint["joint_id"] == 34)
        if mouth.get("policy_index") is not None or not all(_integer(value) for value in policy) or sorted(policy) != list(range(14)):
            raise ValueError("14-dimensional policy order must exclude only mouth 34")
        display = sorted(joints, key=lambda joint: joint["display_index"])
        groups = [joint.get("group") for joint in display]
        if groups != ["left_leg"] * 5 + ["right_leg"] * 5 + ["head"] * 5:
            raise ValueError("display groups must be left leg, right leg, then head")
        for joint in joints:
            if not all(isinstance(joint.get(field), str) and joint[field] for field in ("name_en", "name_zh")):
                raise ValueError("joint mapping names must be nonempty strings")

    @staticmethod
    def _validate_fixture(fixture: object, mapping: list[dict]) -> None:
        if not isinstance(fixture, dict) or any(fixture.get(key) is not value and fixture.get(key) != value for key, value in SAMPLE_MARKERS.items()):
            raise ValueError("sample fixtures must explicitly identify sample/fake data")
        # Equality alone would accept integers 0/1 for booleans.
        if any(type(fixture.get(key)) is not bool for key in ("sample", "fake", "simulated")):
            raise ValueError("sample source markers must be booleans")
        joints = fixture.get("joints")
        if not isinstance(joints, list) or len(joints) != 15 or not all(isinstance(j, dict) for j in joints):
            raise ValueError("sample fixture must contain 15 joint rows")
        ids = [joint.get("joint_id") for joint in joints]
        if not all(_integer(value) for value in ids) or len(set(ids)) != 15 or set(ids) != {joint["joint_id"] for joint in mapping}:
            raise ValueError("sample joint IDs must match the shared mapping exactly")
        for joint in joints:
            if joint.get("status") not in ("sample", "missing"):
                raise ValueError("fixture joint status must be sample or missing")
            for field in JOINT_VALUE_FIELDS:
                if field not in joint:
                    raise ValueError(f"sample joint is missing {field}")
                value = joint[field]
                if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
                    raise ValueError(f"{field} must be null or a finite number")
                if joint["status"] == "missing" and value is not None:
                    raise ValueError("missing joints must not contain invented feedback")
                if field in ("position_ticks", "goal_ticks", "load_raw") and value is not None and not _integer(value):
                    raise ValueError(f"{field} must be an integer raw value")

    def joint_mapping(self) -> list[dict]:
        return deepcopy(self._joint_mapping)

    def read_sample(self) -> list[dict]:
        return deepcopy(self._joints)

