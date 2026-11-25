#!/usr/bin/python3 -I
"""Fixed, read-only inventory for the restricted infrastructure plan identity."""
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

if os.geteuid() != 0 or len(sys.argv) != 1:
    raise SystemExit(1)
UNITS = ("nasj-api", "nasj-web", "nasj-worker", "postgresql", "nginx",
         "nasj-backup.timer", "nasj-monitor.timer")
PATHS = ("/etc/nasj/deploy.conf", "/etc/nasj/runtime.env", "/etc/nasj/migration.env",
         "/etc/nasj/backup.identity", "/etc/nasj/backup-neon.pgpass", "/etc/nasj/notify.curl",
         "/var/lib/nasj-deploy/logs", "/srv/nasj-backups")

def invoke(*args):
    return subprocess.run(args, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, timeout=5, check=False)

def mode(path):
    try:
        s = os.lstat(path)
        return {"uid": s.st_uid, "gid": s.st_gid, "mode": f"{stat.S_IMODE(s.st_mode):04o}",
                "symlink": stat.S_ISLNK(s.st_mode)}
    except FileNotFoundError:
        return None

units = {u: invoke("/usr/bin/systemctl", "is-active", u).returncode == 0 for u in UNITS}
backup = Path("/srv/nasj-backups")
mount = invoke("/usr/bin/findmnt", "-n", "-o", "OPTIONS", "--mountpoint", str(backup))
isolated = mount.returncode == 0 and backup.stat().st_dev != Path("/var/lib/postgresql").stat().st_dev
link = Path("/srv/nasj")
target = str(link.resolve()) if link.is_symlink() else ""
release_versioned = target.startswith("/srv/nasj-releases/") and Path(target).is_dir()
print(json.dumps({
    "schema": 1, "units_active": units, "file_metadata": {p: mode(p) for p in PATHS},
    "backup_isolated": isolated,
    "backup_restrictive_mount": mount.returncode == 0 and
        {"nodev", "nosuid", "noexec"} <= set(mount.stdout.strip().split(",")),
    "release_versioned": release_versioned,
    "deployment_pending": Path("/var/lib/nasj-deploy/pending").exists(),
}, sort_keys=True))
