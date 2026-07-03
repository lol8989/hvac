#!/usr/bin/env bash
# PreToolUse(Bash) 가드: 위험 명령 차단. tool_input(JSON)이 stdin으로 온다. 위험하면 exit 2.
input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c "import sys,json;print((json.load(sys.stdin).get('tool_input') or {}).get('command',''))" 2>/dev/null)"
case "$cmd" in
  *"rm -rf /"*|*"rm -rf ~"*|*":(){:|:&};:"*|*"git push --force"*|*"git push -f"*|*"mkfs"*|*"> /dev/sd"*)
    echo "🚫 차단: 위험 명령 감지 → $cmd" >&2; exit 2;;
esac
exit 0
