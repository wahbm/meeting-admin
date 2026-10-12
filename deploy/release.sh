#!/usr/bin/env bash
set -euo pipefail
ROOT=/srv/meeting-admin
RELEASE=${1:?release directory required}
[[ "$RELEASE" =~ ^/srv/meeting-admin/releases/[a-f0-9]{40}-[0-9]+$ ]] || { echo 'Invalid release path' >&2; exit 1; }
[[ -d "$RELEASE" && ! -L "$RELEASE" ]] || exit 1
[[ -f "$RELEASE/build-server/index.js" && -f "$RELEASE/prisma/schema.prisma" ]] || exit 1
exec 9>/run/lock/meeting-admin-release.lock
flock -n 9 || { echo 'Another release is running' >&2; exit 1; }
PREVIOUS=''
if [[ -f "$ROOT/.known-good" ]]; then PREVIOUS=$(cat "$ROOT/.known-good"); fi
run_app() {
  runuser -u meeting-admin -- bash -c 'set -euo pipefail; set -a; source /etc/meeting-admin.env; set +a; cd "$1"; shift; exec "$@"' -- "$RELEASE" "$@"
}
run_app /usr/bin/node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
if [[ -f "$ROOT/persistent/import.json" && ! -f "$ROOT/persistent/.imported" ]]; then
  run_app /usr/bin/node build-server/import-data.js "$ROOT/persistent/import.json"
  touch "$ROOT/persistent/.imported"
fi
run_app /usr/bin/node build-server/seed.js
candidate_started=false
cleanup() {
  if [[ "$candidate_started" == true ]] && [[ "$(systemctl show -p LoadState --value meeting-admin-candidate.service)" == loaded ]]; then
    systemctl stop meeting-admin-candidate.service
  fi
}
trap cleanup EXIT
systemd-run --quiet --collect --unit=meeting-admin-candidate --uid=meeting-admin --gid=meeting-admin \
  --property="WorkingDirectory=$RELEASE" --property=EnvironmentFile=/etc/meeting-admin.env \
  --property=NoNewPrivileges=yes --property=PrivateTmp=yes --property=ProtectHome=yes \
  --property=ProtectSystem=strict --property="ReadWritePaths=$ROOT/persistent" --property=MemoryMax=256M \
  /usr/bin/env PORT=3110 /usr/bin/node "$RELEASE/build-server/index.js"
candidate_started=true
healthy=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3110/api/health >/dev/null; then healthy=true; break; fi
  systemctl is-active --quiet meeting-admin-candidate.service || break
  sleep 1
done
[[ "$healthy" == true ]] || { echo 'Candidate failed; inspect journalctl -u meeting-admin-candidate' >&2; exit 1; }
cleanup
candidate_started=false
ln -s "$RELEASE" "$ROOT/.current-next"
mv -Tf "$ROOT/.current-next" "$ROOT/current"
systemctl restart meeting-admin.service
healthy=false
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3109/api/health >/dev/null; then healthy=true; break; fi
  sleep 1
done
if [[ "$healthy" == true ]] && ! run_app /usr/bin/node build-server/smoke.js http://127.0.0.1:3109; then healthy=false; fi
if [[ "$healthy" != true ]]; then
  if [[ "$PREVIOUS" =~ ^/srv/meeting-admin/releases/[a-f0-9]{40}-[0-9]+$ && -d "$PREVIOUS" ]]; then
    ln -s "$PREVIOUS" "$ROOT/.rollback-next"; mv -Tf "$ROOT/.rollback-next" "$ROOT/current"; systemctl restart meeting-admin.service
    curl --fail --retry 10 --retry-delay 1 http://127.0.0.1:3109/api/health >/dev/null
  else systemctl stop meeting-admin.service; fi
  echo 'Release failed; rollback performed when available' >&2; exit 1
fi
printf '%s\n' "$RELEASE" > "$ROOT/.known-good"
# Only remove other directories under this project's validated release namespace.
for path in "$ROOT"/releases/*; do
  [[ "$path" =~ ^/srv/meeting-admin/releases/[a-f0-9]{40}-[0-9]+$ ]] || continue
  if [[ "$path" != "$RELEASE" && "$path" != "$PREVIOUS" && -d "$path" && ! -L "$path" ]]; then rm -rf -- "$path"; fi
done
printf 'Release healthy: %s\n' "$RELEASE"
