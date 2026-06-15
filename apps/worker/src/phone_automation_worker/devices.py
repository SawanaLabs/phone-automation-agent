from __future__ import annotations

import os
import shutil
import subprocess
from typing import Protocol

from phone_automation_worker.models import DeviceRecord


class DeviceProvider(Protocol):
    def list_devices(self) -> list[DeviceRecord]: ...


class EmptyDeviceProvider:
    def list_devices(self) -> list[DeviceRecord]:
        return []


class AdbDeviceProvider:
    def __init__(self, *, adb_path: str = "adb", timeout_seconds: int = 10) -> None:
        self.adb_path = adb_path
        self.timeout_seconds = timeout_seconds

    def list_devices(self) -> list[DeviceRecord]:
        if shutil.which(self.adb_path) is None:
            raise RuntimeError(f"{self.adb_path} command not found")

        try:
            result = subprocess.run(
                [self.adb_path, "devices", "-l"],
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            raise RuntimeError("adb devices timed out") from error

        if result.returncode != 0:
            detail = (
                result.stderr.strip() or result.stdout.strip() or "adb devices failed"
            )
            raise RuntimeError(detail)

        return _parse_adb_devices(result.stdout)


def build_device_provider_from_env() -> DeviceProvider:
    mode = os.getenv("PHONE_AUTOMATION_DEVICE_PROVIDER")

    if mode is None:
        mode = (
            "adb"
            if os.getenv("PHONE_AUTOMATION_WORKER_RUNNER") == "open-autoglm"
            else "none"
        )

    if mode == "none":
        return EmptyDeviceProvider()

    if mode == "adb":
        return AdbDeviceProvider(adb_path=os.getenv("ADB_PATH", "adb"))

    raise RuntimeError(
        "Unsupported PHONE_AUTOMATION_DEVICE_PROVIDER value. Expected one of: none, adb."
    )


def _parse_adb_devices(output: str) -> list[DeviceRecord]:
    devices: list[DeviceRecord] = []

    for line in output.splitlines()[1:]:
        stripped = line.strip()
        if not stripped:
            continue

        parts = stripped.split()
        if len(parts) < 2:
            continue

        device_id = parts[0]
        adb_status = parts[1]
        devices.append(
            DeviceRecord(
                id=device_id,
                kind="android",
                status="available" if adb_status == "device" else "unavailable",
                label=_read_model_label(parts[2:]),
                detail=stripped,
            )
        )

    return devices


def _read_model_label(parts: list[str]) -> str | None:
    for part in parts:
        if part.startswith("model:"):
            return part.removeprefix("model:")

    return None
