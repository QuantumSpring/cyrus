#!/bin/bash
set -e

LOGS_SRC="$HOME/.cyrus/logs"
LOGS_DST="$(dirname "$0")/logs"

mkdir -p "$LOGS_DST"

for dir in "$LOGS_SRC"/*/; do
    name=$(basename "$dir")
    outfile="$LOGS_DST/${name}.md"

    echo "Collecting $name..."

    echo "# $name" > "$outfile"
    echo "" >> "$outfile"

    # Sort session*.md files by modification time (oldest first)
    for f in $(ls -tr "$dir"session*.md 2>/dev/null | grep -v 'session-pending'); do
        echo "---" >> "$outfile"
        echo "" >> "$outfile"
        echo "## $(basename "$f")" >> "$outfile"
        echo "" >> "$outfile"
        cat "$f" >> "$outfile"
        echo "" >> "$outfile"
    done

    echo "  -> $outfile"
done

echo ""
echo "Done."
