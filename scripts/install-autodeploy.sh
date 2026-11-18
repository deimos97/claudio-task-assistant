#!/bin/zsh
# Instala (o reinstala) el despliegue automático: cada minuto, si origin/main ha cambiado,
# se despliega prod. LaunchAgent com.deimos97.claudio.autodeploy. Ver docs/despliegue.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$HOME/.claudio/auto-deploy.sh"   # copia fuera del repo: no depende de la rama de la copia de trabajo
LABEL="com.deimos97.claudio.autodeploy"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/.claudio"
cp "$REPO_DIR/scripts/auto-deploy.sh" "$SCRIPT"
chmod 700 "$SCRIPT"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/claudio-deploy.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claudio-deploy.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ $LABEL: comprueba origin/main cada minuto (log: ~/Library/Logs/claudio-deploy.log)"
