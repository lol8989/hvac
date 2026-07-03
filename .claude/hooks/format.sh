#!/usr/bin/env bash
# PostToolUse(Edit|Write) 포맷터: 수정 파일을 prettier로 정리(비차단).
f="$(cat | python3 -c "import sys,json;print((json.load(sys.stdin).get('tool_input') or {}).get('file_path',''))" 2>/dev/null)"
case "$f" in
  *.js|*.jsx|*.ts|*.tsx|*.css|*.json|*.md) npx --no-install prettier --write "$f" >/dev/null 2>&1 || true;;
esac
exit 0
