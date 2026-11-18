#!/bin/zsh
# Instala (o reinstala) el servicio de voz de macOS: compila scripts/voice-server.swift en
# ~/.claudio/bin/claudio-voice y lo deja como LaunchAgent com.deimos97.claudio.voice
# (127.0.0.1:3122). Común a dev y prod. Ver docs/voz.md.
# Necesita las voces "Jorge (mejorada)" y "Mónica (mejorada)" descargadas en Ajustes.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$HOME/.claudio/bin/claudio-voice"   # fuera del repo: no depende de la rama de la copia de trabajo
LABEL="com.deimos97.claudio.voice"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/.claudio/bin"
swiftc -O "$REPO_DIR/scripts/voice-server.swift" -o "$BIN.new"
mv "$BIN.new" "$BIN"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/claudio-voice.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claudio-voice.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
sleep 2
curl -fsS http://127.0.0.1:3122/health >/dev/null && echo "✓ $LABEL → http://127.0.0.1:3122 (log: ~/Library/Logs/claudio-voice.log)"
