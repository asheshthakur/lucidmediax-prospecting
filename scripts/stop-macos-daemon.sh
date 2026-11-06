#!/bin/bash
# Stops and uninstalls the macOS LaunchAgent background service
PLIST_FILE="$HOME/Library/LaunchAgents/com.lucidmediax.prospecting.plist"

if [ -f "$PLIST_FILE" ]; then
    launchctl unload "$PLIST_FILE" 2>/dev/null || true
    rm "$PLIST_FILE"
    echo "✓ LucidMediax background daemon stopped and removed."
else
    echo "No active background daemon found."
fi
