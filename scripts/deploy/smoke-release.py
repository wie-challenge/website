#!/usr/bin/env python3
"""Run the packaged native release against a disposable PostgreSQL, never the VPS."""

import importlib.util
import json
import os
import secrets
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, check=True, **kwargs)


def request(url):
    with urllib.request.urlopen(url, timeout=3) as response:
        return response.status, response.read()


archive = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location(
    "nasj_extract", Path(__file__).with_name("extract-release.py")
)
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
with tarfile.open(archive) as bundle:
    info = json.load(bundle.extractfile(".release.json"))
if info["node"] != run(["node", "--version"]).stdout.strip():
    raise RuntimeError("Smoke runtime Node version differs from the packaged release")
# A CI runner has dedicated ports. Refuse to disturb an existing local development process.
for port in [3000, 3001]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", port))
name = "nasj-release-smoke-" + secrets.token_hex(6)
created = False
children = []
with tempfile.TemporaryDirectory(prefix="nasj-release-smoke-") as scratch:
    root = Path(scratch)
    release = root / "release"
    extractor.extract(archive, release, info["sha"])
    (release / "apps/web/.next/cache").mkdir(mode=0o700)
    log = (root / "processes.log").open("w+")
    try:
        password = secrets.token_hex(24)
        run(
            [
                "docker",
                "run",
                "--rm",
                "-d",
                "--name",
                name,
                "-p",
                "127.0.0.1::5432",
                "-e",
                "POSTGRES_PASSWORD=" + password,
                "-e",
                "POSTGRES_DB=nasj_smoke",
                os.environ.get("POSTGRES_TEST_IMAGE", "postgres:16.11-alpine"),
            ]
        )
        created = True
        port = json.loads(
            run(
                [
                    "docker",
                    "inspect",
                    "--format",
                    "{{json .NetworkSettings.Ports}}",
                    name,
                ]
            ).stdout
        )["5432/tcp"][0]["HostPort"]
        for _ in range(60):
            if (
                subprocess.run(
                    [
                        "docker",
                        "exec",
                        name,
                        "pg_isready",
                        "-U",
                        "postgres",
                        "-d",
                        "nasj_smoke",
                    ],
                    capture_output=True,
                    check=False,
                ).returncode
                == 0
            ):
                break
            time.sleep(0.5)
        env = {
            **os.environ,
            "NODE_ENV": "production",
            "API_HOST": "127.0.0.1",
            "API_PORT": "3001",
            "DATABASE_URL": f"postgresql://postgres:{password}@127.0.0.1:{port}/nasj_smoke",
            "PUBLIC_APP_URL": "https://nasj.example.com",
            "BETTER_AUTH_SECRET": secrets.token_hex(48),
            "REQUIRE_PRIVILEGED_MFA": "true",
            "ARCJET_ENABLED": "true",
            "ARCJET_MODE": "LIVE",
            "ARCJET_KEY": "ajkey_synthetic_smoke_only",
            "SMTP_REQUIRE_TLS": "true",
            "SMTP_USER": "synthetic",
            "SMTP_PASSWORD": secrets.token_hex(24),
            "NEXT_TELEMETRY_DISABLED": "1",
            "API_INTERNAL_URL": "http://127.0.0.1:3001",
        }
        # No inherited migration URL or local demo/assistant configuration can override this DB.
        for key in [
            "MIGRATION_DATABASE_URL",
            "DEMO_MODE",
            "ASSISTANT_AMQP_URL",
            "NEXT_DIST_DIR",
        ]:
            env.pop(key, None)
        run(
            ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"],
            cwd=release / "apps/api",
            env=env,
        )
        run(
            ["node", "scripts/deploy-check-schema.mjs"],
            cwd=release / "apps/api",
            env=env,
        )
        for command, cwd in [
            (["node", "apps/api/dist/main.js"], release),
            (
                [
                    "node",
                    "node_modules/next/dist/bin/next",
                    "start",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    "3000",
                ],
                release / "apps/web",
            ),
            (["node", "apps/api/dist/jobs/main.js", "--watch"], release),
        ]:
            children.append(
                subprocess.Popen(
                    command,
                    cwd=cwd,
                    env=env,
                    stdout=log,
                    stderr=log,
                    start_new_session=True,
                )
            )
        for _ in range(60):
            try:
                status, body = request("http://127.0.0.1:3001/api/health/ready")
                if (
                    status == 200
                    and json.loads(body)["status"] == "ready"
                    and request("http://127.0.0.1:3000/")[0] == 200
                ):
                    break
            except (OSError, ValueError, urllib.error.URLError):
                pass
            time.sleep(1)
        else:
            raise RuntimeError("Packaged application did not become ready")
        if any(child.poll() is not None for child in children):
            raise RuntimeError("Packaged service exited unexpectedly")
        run(["node", "apps/api/dist/jobs/main.js", "--status"], cwd=release, env=env)
        print("NATIVE_ARTIFACT_SMOKE_READY: migrations, schema, API, web and worker")
    finally:
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        if created:
            run(["docker", "rm", "-f", "--volumes", name])
        log.close()
