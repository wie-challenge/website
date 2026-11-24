#!/usr/bin/env python3
"""Prepare a fresh QEMU/KVM NASJ guest using an already verified Ubuntu cloud image."""

import argparse
import io
import json
from pathlib import Path
import subprocess

import pycdlib


def call(*args: str) -> None:
    subprocess.run(args, check=True)


parser = argparse.ArgumentParser()
parser.add_argument("image", type=Path, help="Ubuntu 24.04 qcow2 verified against Ubuntu SHA256SUMS")
parser.add_argument("directory", type=Path, help="A new private working directory")
parser.add_argument("--ssh-port", type=int, default=22224)
args = parser.parse_args()
image = args.image.resolve(strict=True)
root = args.directory.resolve()
root.mkdir(mode=0o700, exist_ok=False)
for key in ("admin", "host", "deploy"):
    call("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(root / key))
pub = (root / "admin.pub").read_text().strip()
host_pub = (root / "host.pub").read_text().split()[:2]
host_priv = (root / "host").read_text()
(root / "known_hosts").write_text(f"[127.0.0.1]:{args.ssh_port} {' '.join(host_pub)}\n")
user = {
    "users": [
        {
            "name": "ubuntu",
            "groups": ["sudo"],
            "sudo": "ALL=(ALL) NOPASSWD:ALL",
            "shell": "/bin/bash",
            "lock_passwd": True,
            "ssh_authorized_keys": [pub],
        }
    ],
    "ssh_pwauth": False,
    "ssh_deletekeys": False,
    "ssh_keys": {"ed25519_private": host_priv, "ed25519_public": " ".join(host_pub)},
    "disk_setup": {"/dev/vdb": {"table_type": "gpt", "layout": "auto", "overwrite": False}},
    "fs_setup": [
        {"label": "nasj_backup_vm", "filesystem": "ext4", "device": "/dev/vdb1", "overwrite": False}
    ],
    "mounts": [
        ["LABEL=nasj_backup_vm", "/srv/nasj-backups", "ext4", "defaults,nodev,nosuid,noexec,nofail", "0", "2"]
    ],
}
iso = pycdlib.PyCdlib()
iso.new(interchange_level=3, vol_ident="CIDATA", rock_ridge="1.09")
for file, iso_name, data in (
    ("user-data", "/USERDATA.;1", "#cloud-config\n" + json.dumps(user)),
    ("meta-data", "/METADATA.;1", "instance-id: nasj-qualification\nlocal-hostname: nasj-staging\n"),
):
    encoded = data.encode()
    iso.add_fp(io.BytesIO(encoded), len(encoded), iso_path=iso_name, rr_name=file)
iso.write(str(root / "seed.iso"))
iso.close()
(root / "seed.iso").chmod(0o600)
call("qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", str(image), str(root / "guest.qcow2"), "24G")
call("qemu-img", "create", "-f", "qcow2", str(root / "backup.qcow2"), "8G")
call(
    "qemu-system-x86_64", "-accel", "kvm", "-cpu", "host", "-m", "3072", "-smp", "2",
    "-drive", f"file={root / 'guest.qcow2'},if=virtio,format=qcow2",
    "-drive", f"file={root / 'backup.qcow2'},if=virtio,format=qcow2",
    "-drive", f"file={root / 'seed.iso'},media=cdrom,readonly=on",
    "-netdev", f"user,id=network,hostfwd=tcp:127.0.0.1:{args.ssh_port}-:22",
    "-device", "virtio-net-pci,netdev=network",
    "-display", "none", "-serial", f"file:{root / 'serial.log'}",
    "-pidfile", str(root / "qemu.pid"), "-daemonize",
)
print(f"Guest SSH is bound to 127.0.0.1:{args.ssh_port}; use {root / 'known_hosts'} to verify its host key.")
