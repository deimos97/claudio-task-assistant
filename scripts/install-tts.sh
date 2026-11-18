#!/bin/zsh
# Instala (o reinstala) la voz neuronal de Claudio: Kokoro como LaunchAgent en
# 127.0.0.1:3121, común a dev y prod. Ver docs/voz.md.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV="$HOME/.claudio/tts-venv"
MODELS="$HOME/.claudio/models/tts"
SERVER="$HOME/.claudio/kokoro-server.py"   # copia fuera del repo: no depende de la rama que haya en la copia de trabajo
LABEL="com.deimos97.claudio.kokoro"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[[ -x /opt/homebrew/bin/python3.12 ]] || brew install python@3.12
[[ -x "$VENV/bin/python" ]] || /opt/homebrew/bin/python3.12 -m venv "$VENV"
"$VENV/bin/pip" install -q kokoro-onnx soundfile

mkdir -p "$MODELS"
BASE=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
[[ -f "$MODELS/kokoro-v1.0.onnx" ]] || curl -fL -o "$MODELS/kokoro-v1.0.onnx" "$BASE/kokoro-v1.0.onnx"
[[ -f "$MODELS/voices-v1.0.bin" ]]  || curl -fL -o "$MODELS/voices-v1.0.bin"  "$BASE/voices-v1.0.bin"

cp "$REPO_DIR/scripts/kokoro-server.py" "$SERVER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$VENV/bin/python</string>
    <string>-I</string>
    <string>$SERVER</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/claudio-kokoro.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claudio-kokoro.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ $LABEL → http://127.0.0.1:3121 (logs: ~/Library/Logs/claudio-kokoro.log)"
