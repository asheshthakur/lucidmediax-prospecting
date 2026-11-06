#!/bin/bash
# Installs LucidMediax Growth Intelligence as a background 24/7 service on macOS
set -e

PLIST_DIR="$HOME/Library/LaunchAgents"
PLIST_FILE="$PLIST_DIR/com.lucidmediax.prospecting.plist"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(which node)"

mkdir -p "$PLIST_DIR"
mkdir -p "$PROJECT_DIR/data/logs"

cat <<EOF > "$PLIST_FILE"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.lucidmediax.prospecting</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$PROJECT_DIR/server/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>3500</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/data/logs/daemon_stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/data/logs/daemon_stderr.log</string>
</dict>
</plist>
EOF

# Unload previous instance if present
launchctl unload "$PLIST_FILE" 2>/dev/null || true

# Load and launch
launchctl load "$PLIST_FILE"

echo "=========================================================="
echo "✓ LucidMediax Command Center is now running 24/7 in the background!"
echo "  URL: http://localhost:3500"
echo "  Service: $PLIST_FILE"
echo "  Logs: $PROJECT_DIR/data/logs/daemon_stdout.log"
echo "  It will automatically resume whenever your Mac reboots."
echo "=========================================================="
