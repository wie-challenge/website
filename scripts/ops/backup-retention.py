#!/usr/bin/env python3
"""Expire only complete NASJ backup pairs, preserving the newest and current receipts."""

import json
import re
import sys
import time
from pathlib import Path

POLICY = {"daily": 30, "weekly": 84, "monthly": 183, "pre-migration": 30}
NAME = re.compile(r"\d{8}T\d{6}Z-[a-f0-9-]{36}\.json")


def expire(root: Path, current: str, now: float) -> None:
    for category, days in POLICY.items():
        folder = root / category
        if not folder.is_dir() or folder.is_symlink():
            raise ValueError("Invalid retention directory")
        pairs = []
        for manifest in folder.iterdir():
            if not NAME.fullmatch(manifest.name) or manifest.is_symlink() or not manifest.is_file():
                continue
            archive = manifest.with_suffix(".dump.age")
            if not archive.is_file() or archive.is_symlink():
                continue
            key = f"{category}/{manifest.stem}"
            data = json.loads(manifest.read_text())
            if data.get("key") != f"{key}.dump.age" or data.get("location") != "same-vps":
                continue
            pairs.append((manifest.stat().st_mtime, key, manifest, archive))
        newest = max(pairs, default=None)
        if newest is None:
            continue
        for stamp, key, manifest, archive in pairs:
            if key in (current, newest[1]) or now - stamp < days * 86400:
                continue
            archive.unlink()
            manifest.unlink()


if __name__ == "__main__":
    expire(Path(sys.argv[1]), sys.argv[2], time.time())
