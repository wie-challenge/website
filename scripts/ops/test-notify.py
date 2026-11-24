"""Exercise notification formats and bounded retries with an isolated HTTPS receiver."""

from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import tempfile
import threading


class MockServer(HTTPServer):
    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            super().handle_error(request, client_address)


class Receiver(BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        self.server.requests.append((self.path, json.loads(body)))
        if self.path == "/exhaust" or (self.path == "/retry" and len(self.server.requests) < 3):
            self.send_response(503)
        else:
            self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory() as directory:
    base = Path(directory)
    cert, key = base / "cert.pem", base / "key.pem"
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
         "-days", "1", "-subj", "/CN=localhost", "-addext",
         "subjectAltName=DNS:localhost", "-keyout", str(key), "-out", str(cert)],
        check=True, capture_output=True,
    )
    with MockServer(("127.0.0.1", 0), Receiver) as server:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(cert, key)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        server.requests = []
        worker = threading.Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            config = base / "notify.curl"
            script = Path(__file__).with_name("notify.sh")

            def send(mode, path, *, trust=True):
                url = f"https://localhost:{server.server_port}/{path}"
                config.write_text(f'url = "{url}"\n' + (f'cacert = "{cert}"\n' if trust else 'insecure\n'))
                env = dict(os.environ, NO_PROXY="localhost", NASJ_NOTIFY_CURL_CONFIG=str(config),
                           NASJ_NOTIFY_FORMAT=mode, NASJ_NOTIFY_ENVIRONMENT="qualification")
                return subprocess.run(["bash", str(script), "nasj-backup.service"],
                                      env=env, capture_output=True, timeout=25)

            assert send("generic", "generic").returncode == 0
            generic = server.requests.pop()[1]
            assert generic == {"unit": "nasj-backup.service", "state": "failed",
                               "environment": "qualification", "timestamp": generic["timestamp"]}
            assert re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", generic["timestamp"])
            assert send("discord", "retry").returncode == 0
            assert len(server.requests) == 3
            for path, discord in server.requests:
                assert path == "/retry" and discord["allowed_mentions"] == {"parse": []}
                assert re.fullmatch(r"NASJ qualification \| nasj-backup\.service failed \| "
                                    r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ", discord["content"])
            assert send("discord", "untrusted", trust=False).returncode == 60
            assert send("invalid", "invalid").returncode == 2
            assert len(server.requests) == 3
            server.requests.clear()
            assert send("discord", "exhaust").returncode == 22
            assert len(server.requests) == 3
        finally:
            server.shutdown()
print("Notification HTTPS formats, verified TLS, and bounded retry passed")
