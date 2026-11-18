#!/bin/zsh
# Instala (o reinstala) el LaunchAgent de Claudio para un entorno.
#   scripts/install-agent.sh dev    → sirve esta copia de trabajo (rama dev) en :3111, con --watch
#   scripts/install-agent.sh prod   → sirve ~/Services/claudio-prod (rama main) en :3110
set -euo pipefail

ENV_NAME="${1:?uso: install-agent.sh dev|prod}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROD_DIR="$HOME/Services/claudio-prod"
NODE="$(command -v node)"
LABEL="com.deimos97.claudio.$ENV_NAME"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

case "$ENV_NAME" in
  dev)  DIR="$REPO_DIR"; PORT=3111; ARGS="<string>--watch</string>" ;;
  prod) DIR="$PROD_DIR"; PORT=3110; ARGS="" ;;
  *) echo "Entorno desconocido: $ENV_NAME" >&2; exit 1 ;;
esac

[[ -f "$DIR/server/index.ts" ]] || { echo "No existe $DIR/server/index.ts (¿falta desplegar?)" >&2; exit 1; }

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    $ARGS
    <string>server/index.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>CLAUDIO_ENV</key><string>$ENV_NAME</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/claudio-$ENV_NAME.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claudio-$ENV_NAME.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ $LABEL → http://localhost:$PORT (logs: ~/Library/Logs/claudio-$ENV_NAME.log)"
