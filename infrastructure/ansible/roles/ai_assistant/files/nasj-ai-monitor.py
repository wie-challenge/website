#!/usr/bin/python3
"""Emit bounded broker health metadata and suppress duplicate failure alerts."""

import json
import subprocess
import time
from pathlib import Path


def run(*argv):
    return subprocess.check_output(argv, stderr=subprocess.DEVNULL, timeout=10, text=True)


stamp = Path("/var/lib/nasj-ai-monitor/last-alert")
try:
    run("/usr/sbin/rabbitmq-diagnostics", "-q", "-n", "rabbit@localhost", "check_local_alarms")
    queues = json.loads(run(
        "/usr/sbin/rabbitmqctl", "-q", "-n", "rabbit@localhost", "list_queues", "-p", "nasj-website",
        "name", "messages_ready", "messages_unacknowledged", "consumers", "--formatter=json",
    ))
    queue = next(row for row in queues if row["name"] == "nasouj.chat.v1")
    print("NASJ_AI_HEALTH", json.dumps({k: queue[k] for k in (
        "messages_ready", "messages_unacknowledged", "consumers",
    )}))
    if queue["consumers"] < 1 or queue["messages_ready"] >= 80:
        raise ValueError
except (subprocess.SubprocessError, ValueError, StopIteration, KeyError):
    print("NASJ_AI_HEALTH degraded")
    now = int(time.time())
    if not stamp.exists() or now - stamp.stat().st_mtime >= 900:
        stamp.touch()
        raise SystemExit(1) from None
else:
    stamp.unlink(missing_ok=True)
