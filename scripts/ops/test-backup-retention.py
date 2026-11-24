"""Check that retention removes only expired complete pairs and keeps recovery points."""

import json
import os
from pathlib import Path
import runpy
import tempfile
import time
import uuid

expire = runpy.run_path(str(Path(__file__).with_name("backup-retention.py")))["expire"]
now = time.time()
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    for name in ("daily", "weekly", "monthly", "pre-migration"):
        (root / name).mkdir()

    def pair(age):
        base = root / "daily" / f"20000101T000000Z-{uuid.uuid4()}"
        archive = base.with_suffix(".dump.age")
        manifest = base.with_suffix(".json")
        archive.write_text("synthetic")
        manifest.write_text(json.dumps({"key": f"daily/{archive.name}", "location": "same-vps"}))
        os.utime(manifest, (now - age * 86400, now - age * 86400))
        return archive, manifest

    expired = pair(60)
    pinned = pair(50)
    newest = pair(40)
    expire(root, f"daily/{pinned[1].stem}", now)
    assert all(not path.exists() for path in expired)
    assert all(path.exists() for path in pinned + newest)
    print("PASS retention: removed expired pair, kept selected and newest verified pair")
