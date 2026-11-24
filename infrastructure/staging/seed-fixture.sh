#!/usr/bin/env bash
# Run only inside the generated staging guest.
set -Eeuo pipefail
[[ $EUID == 0 && $(hostname -s) == nasj-staging && -b /dev/vdb1 && ! -e /srv/nasj ]]
mountpoint -q /srv/nasj-backups
umask 022
systemctl start postgresql
runuser -u postgres -- createdb nasj_fixture
runuser -u postgres -- psql -v ON_ERROR_STOP=1 nasj_fixture <<'SQL'
CREATE TABLE "_prisma_migrations" (migration_name text, checksum text, finished_at timestamptz, rolled_back_at timestamptz);
INSERT INTO "_prisma_migrations" VALUES ('synthetic','synthetic',now(),NULL);
CREATE TABLE fixture(id integer PRIMARY KEY);
INSERT INTO fixture VALUES (42);
SQL
install -d /srv/nasj/apps/api/dist/jobs /etc/nasj /usr/local/libexec
chmod 711 /etc/nasj
touch /srv/nasj/.env
install -o root -g nasj -m 0640 /srv/nasj/.env /etc/nasj/runtime.env
cat >/usr/local/libexec/nasj-fixture-runtime <<'PY'
#!/usr/bin/env python3
import http.server
import pathlib
import sys
import time

if "--version" in sys.argv:
    print("v24.20.0")
    sys.exit(0)
if "--status" in sys.argv:
    sys.exit(pathlib.Path("/srv/nasj/apps/api/dist/fail-worker").exists())
if any("deploy-check-schema" in item for item in sys.argv):
    sys.exit(0)
if "--watch" in sys.argv:
    while True:
        time.sleep(30)
port = int(sys.argv[-1])
if pathlib.Path("/srv/nasj/apps/api/dist/fail-start").exists():
    sys.exit(1)

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if (self.headers.get("X-NASJ-Fixture-Public") == "1"
                and pathlib.Path("/srv/nasj/apps/api/dist/fail-public").exists()):
            self.send_error(503)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(b'{"status":"ready"}')

http.server.HTTPServer(("127.0.0.1", port), Handler).serve_forever()
PY
chmod 755 /usr/local/libexec/nasj-fixture-runtime
for entry in api:3001 web:3000 worker:--watch; do
  unit=${entry%:*}
  arg=${entry#*:}
  cat >"/etc/systemd/system/nasj-$unit.service" <<UNIT
[Unit]
Description=NASJ synthetic $unit
[Service]
User=nasj
WorkingDirectory=/srv/nasj
ExecStart=/usr/local/libexec/nasj-fixture-runtime $arg
[Install]
WantedBy=multi-user.target
UNIT
done
openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj /CN=localhost \
  -addext subjectAltName=DNS:localhost -keyout /etc/ssl/private/nasj-fixture.key \
  -out /usr/local/share/ca-certificates/nasj-fixture.crt >/dev/null 2>&1
chmod 600 /etc/ssl/private/nasj-fixture.key
update-ca-certificates >/dev/null
cat >/etc/nginx/conf.d/nasj-fixture.conf <<'NGINX'
server {
    listen 127.0.0.1:443 ssl;
    server_name localhost;
    ssl_certificate /usr/local/share/ca-certificates/nasj-fixture.crt;
    ssl_certificate_key /etc/ssl/private/nasj-fixture.key;
    location = /test-alert { return 204; }
    location / { proxy_set_header X-NASJ-Fixture-Public 1; proxy_pass http://127.0.0.1:3001; }
}
NGINX
nginx -t
systemctl daemon-reload
systemctl start nginx nasj-api nasj-web nasj-worker
install -d -m 700 /root/nasj-fixture
age-keygen -o /root/nasj-fixture/identity 2>/dev/null
age-keygen -y /root/nasj-fixture/identity >/root/nasj-fixture/recipients
