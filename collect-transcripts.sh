#!/bin/bash
set -e

LOGS_SRC="$HOME/.cyrus/logs"
LOGS_DST="$(dirname "$0")/logs"

mkdir -p "$LOGS_DST/transcripts"

for dir in "$LOGS_SRC"/*/; do
    name=$(basename "$dir")

    jsonl_files=$(ls "$dir"session*.jsonl 2>/dev/null | grep -v 'session-pending' | sort)
    if [ -z "$jsonl_files" ]; then
        echo "Skipping $name (no jsonl files)"
        continue
    fi

    echo "Converting $name..."

    merged="/tmp/cyrus-transcript-${name}.jsonl"

    # Convert Cyrus SDK JSONL format to native Claude Code JSONL format
    python3 -c "
import json, uuid, sys, glob

files = sys.argv[1:]
session_id = None
session_num = 0

for fpath in files:
    with open(fpath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
            except json.JSONDecodeError:
                continue

            msg_type = d.get('type')
            ts = d.get('timestamp')

            if msg_type == 'session-metadata':
                session_id = d.get('sessionId', str(uuid.uuid4()))
                session_num += 1
                workspace = d.get('workspaceName', 'unknown')

                # Inject a synthetic user prompt so the transcript tool sees a conversation
                print(json.dumps({
                    'type': 'user',
                    'message': {
                        'role': 'user',
                        'content': f'[Cyrus session {session_num}: {workspace}] (sessionId: {session_id})'
                    },
                    'timestamp': ts or '',
                    'uuid': str(uuid.uuid4()),
                    'sessionId': session_id,
                }))
                continue

            if msg_type != 'sdk-message':
                continue

            inner = d.get('message', {})
            inner_type = inner.get('type')

            if inner_type == 'system':
                continue

            if inner_type == 'result':
                tool_result = inner.get('tool_result')
                if tool_result:
                    print(json.dumps({
                        'type': 'user',
                        'message': {'role': 'user', 'content': tool_result.get('content', '')},
                        'timestamp': ts or '',
                        'uuid': inner.get('uuid', str(uuid.uuid4())),
                        'sessionId': session_id or inner.get('session_id', ''),
                        'toolUseResult': tool_result,
                    }))
                continue

            if inner_type not in ('assistant', 'user'):
                continue

            print(json.dumps({
                'type': inner_type,
                'message': inner.get('message', {}),
                'timestamp': ts or '',
                'uuid': inner.get('uuid', str(uuid.uuid4())),
                'sessionId': session_id or inner.get('session_id', ''),
            }))
" $jsonl_files > "$merged"

    count=$(wc -l < "$merged")
    if [ "$count" -eq 0 ]; then
        echo "  Skipping $name (no convertible messages)"
        rm -f "$merged"
        continue
    fi

    echo "  $count messages"
    uvx claude-code-transcripts json -o "$LOGS_DST/transcripts/$name" "$merged" 2>&1 | grep -v '^$'

    rm -f "$merged"
    echo "  -> $LOGS_DST/transcripts/$name/index.html"
done

echo ""
echo "Done."
