#!/usr/bin/env python3
"""Exercise schema gates against a disposable PostgreSQL instance; run from repository root."""

import json
import os
import secrets
import subprocess
import time

name = "nasj-cd-schema-" + secrets.token_hex(5)
created = False
password = secrets.token_hex(24)


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)


try:
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
            "POSTGRES_DB=nasj",
            os.environ.get("POSTGRES_TEST_IMAGE", "postgres:17.7-alpine"),
        ]
    )
    created = True
    port = json.loads(
        run(
            ["docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", name]
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
                    "-h",
                    "127.0.0.1",
                    "-U",
                    "postgres",
                    "-d",
                    "nasj",
                ],
                capture_output=True,
                check=False,
            ).returncode
            == 0
        ):
            break
        time.sleep(0.5)
    else:
        raise RuntimeError("Disposable PostgreSQL did not accept TCP connections")
    url = f"postgresql://postgres:{password}@127.0.0.1:{port}/nasj"
    env = {**os.environ, "MIGRATION_DATABASE_URL": url, "DATABASE_URL": url}
    checker = ["node", "apps/api/scripts/deploy-check-schema.mjs"]

    def check(expected):
        result = subprocess.run(
            checker, env=env, capture_output=True, text=True, check=False
        )
        assert result.returncode == expected, (
            expected,
            result.returncode,
            result.stdout,
            result.stderr,
        )

    check(10)
    run(["pnpm", "--filter", "@nasj/api", "db:migrate"], env=env)
    check(0)

    def sql(query):
        run(
            [
                "docker",
                "exec",
                name,
                "psql",
                "-U",
                "postgres",
                "-d",
                "nasj",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                query,
            ]
        )

    sql(
        """INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES ('extra','extra','future_additive_migration',now(),now(),1)"""
    )
    check(0)
    sql(
        """INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,applied_steps_count) VALUES ('failed','failed','failed_migration',now(),0)"""
    )
    check(1)
    sql("""DELETE FROM "_prisma_migrations" WHERE id = 'failed' """)
    sql(
        """UPDATE "_prisma_migrations" SET checksum = 'invalid' WHERE migration_name=(SELECT min(migration_name) FROM "_prisma_migrations")"""
    )
    check(1)
    print(
        "Real PostgreSQL schema gates passed: empty/pending, applied, extra additive history, failed migration, checksum mismatch."
    )
finally:
    if created:
        run(["docker", "rm", "-f", "-v", name])
