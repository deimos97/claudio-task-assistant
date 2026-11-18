#!/bin/zsh
# Despliega producción: deja ~/Services/claudio-prod igual que origin/main y reinicia el servicio.
# Solo se ejecuta después de que Javier apruebe el merge dev → main.
set -euo pipefail

PROD_DIR="$HOME/Services/claudio-prod"
REPO_URL="https://github.com/deimos97/claudio-task-assistant.git"
LABEL="com.deimos97.claudio.prod"
SCRIPTS="$(cd "$(dirname "$0")" && pwd)"

if [[ ! -d "$PROD_DIR/.git" ]]; then
  mkdir -p "$(dirname "$PROD_DIR")"
  git clone --branch main "$REPO_URL" "$PROD_DIR"
fi

cd "$PROD_DIR"
git fetch --quiet origin main
echo "Desplegando $(git rev-parse --short HEAD) → $(git rev-parse --short origin/main)"
git reset --hard --quiet origin/main
npm ci --omit=dev --silent

if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/$(id -u)/$LABEL"
else
  "$SCRIPTS/install-agent.sh" prod
fi

sleep 2
curl -fsS http://localhost:3110/api/health && echo
