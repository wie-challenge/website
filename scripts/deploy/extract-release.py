#!/usr/bin/env python3
"""Validate and extract a release into a new private directory; never run archive code."""

import json
import os
import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath


def extract(archive: Path, destination: Path, sha: str):
    if destination.exists():
        raise ValueError("Destination already exists")
    allowed = {
        "apps",
        "packages",
        "node_modules",
        "package.json",
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
        "tsconfig.base.json",
        ".release.json",
    }
    with tarfile.open(archive, "r:gz") as release:
        members = []
        total = 0
        for item in release:
            total += item.size
            if len(members) >= 200000 or total > 4 * 1024**3:
                raise ValueError("Release exceeds extraction limits")
            members.append(item)
        for member in members:
            path = PurePosixPath(member.name)
            if (
                path.is_absolute()
                or ".." in path.parts
                or not path.parts
                or path.parts[0] not in allowed
            ):
                raise ValueError("Unexpected archive path")
            if path.name in {".env", ".migration.env", ".artifact-sha256"}:
                raise ValueError("Runtime configuration is not a release artifact")
            if not (
                member.isfile() or member.isdir() or member.issym() or member.islnk()
            ):
                raise ValueError("Special files are not permitted")
            if path == PurePosixPath(
                "apps/web/.next/cache"
            ) or "apps/web/.next/cache" in str(path):
                raise ValueError("Runtime cache must not come from the archive")
        paths = {PurePosixPath(item.name): item for item in members}
        if len(paths) != len(members):
            raise ValueError("Duplicate archive paths are not permitted")
        for path in paths:
            if any(
                parent in paths and not paths[parent].isdir() for parent in path.parents
            ):
                raise ValueError("Archive file or link cannot be an ancestor")
        required = total + 256 * 1024**2
        if shutil.disk_usage(destination.parent).free < required:
            raise ValueError("Insufficient release storage")
        destination.mkdir(mode=0o700)
        # Python 3.12+ data filtering refuses links escaping the release and special device files.
        release.extractall(destination, filter="data")
    for directory in ["apps", "apps/api", "apps/web", "apps/web/.next"]:
        path = destination / directory
        if not path.is_dir() or path.is_symlink():
            raise ValueError("Critical release directory is missing or linked")
    manifest = destination / ".release.json"
    if manifest.is_symlink():
        raise ValueError("Release manifest must be a regular file")
    info = json.loads(manifest.read_text())
    if (
        info.get("sha") != sha
        or info.get("platform") != "linux"
        or info.get("arch") != "x64"
    ):
        raise ValueError("Release identity or architecture mismatch")
    for name in [
        "apps/api/dist/main.js",
        "apps/api/dist/jobs/main.js",
        "apps/api/scripts/deploy-check-schema.mjs",
        "apps/api/prisma.config.ts",
        "apps/api/node_modules/prisma/build/index.js",
        "apps/web/node_modules/next/dist/bin/next",
        "apps/web/.next/BUILD_ID",
    ]:
        if not (destination / name).is_file():
            raise ValueError("Required runtime file is missing")
    for root, directories, files in os.walk(destination, followlinks=False):
        for name in files:
            path = Path(root) / name
            if not path.is_symlink():
                path.chmod(0o555 if path.stat().st_mode & 0o111 else 0o444)
        for name in directories:
            path = Path(root) / name
            if not path.is_symlink():
                path.chmod(0o755)
    destination.chmod(0o755)


if __name__ == "__main__":
    try:
        extract(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
    except (
        OSError,
        ValueError,
        tarfile.TarError,
        KeyError,
        IndexError,
        MemoryError,
    ) as error:
        print(f"RELEASE_REJECTED: {type(error).__name__}", file=sys.stderr)
        raise SystemExit(1)
