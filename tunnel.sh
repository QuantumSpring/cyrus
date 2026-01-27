#!/bin/bash

# Default port if not specified
PORT=${1:-3456}

echo "Starting cloudflared tunnel for localhost:$PORT..."
echo "Press Ctrl+C to stop the tunnel"
echo ""

# Start cloudflared and capture output
cloudflared tunnel --url "http://localhost:$PORT" 2>&1 | while IFS= read -r line; do
    echo "$line"
    # Extract and highlight the public URL
    if [[ "$line" =~ https://[a-zA-Z0-9-]+\.trycloudflare\.com ]]; then
        URL="${BASH_REMATCH[0]}"
        echo ""
        echo "=========================================="
        echo "PUBLIC URL: $URL"
        echo "=========================================="
        echo ""
    fi
done
