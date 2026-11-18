#!/bin/zsh
# Instala (o reinstala) el reconocimiento de voz de Claudio: whisper.cpp como
# LaunchAgent en 127.0.0.1:3120, común a dev y prod. Ver docs/voz.md.
set -euo pipefail

MODELS="$HOME/.claudio/models"
MODEL="$MODELS/ggml-large-v3-turbo-q5_0.bin"
VAD="$MODELS/ggml-silero-v5.1.2.bin"
LABEL="com.deimos97.claudio.whisper"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
PORT=3120

command -v whisper-server >/dev/null || brew install whisper-cpp
mkdir -p "$MODELS"
[[ -f "$MODEL" ]] || curl -fL -o "$MODEL" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
[[ -f "$VAD" ]]   || curl -fL -o "$VAD"   https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v whisper-server)</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>$PORT</string>
    <string>-m</string><string>$MODEL</string>
    <string>-l</string><string>auto</string>
    <string>-nt</string>
    <string>--vad</string>
    <string>-vm</string><string>$VAD</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>
  <key>StandardOutPath</key><string>/dev/null</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/claudio-whisper.log</string>
</dict>
</plist>
EOF

plutil -lint "$PLIST" >/dev/null
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ $LABEL → http://127.0.0.1:$PORT (logs: ~/Library/Logs/claudio-whisper.log)"
