#!/usr/bin/env bash
set -uo pipefail
missing=0
while IFS='|' read -r file pattern; do
  [ -z "${file// }" ] && continue
  case "$file" in \#*) continue ;; esac
  if grep -qF -- "$pattern" "$file" 2>/dev/null; then echo "  ok       $file"; else echo "::error file=$file::Fix missing after merge: '$pattern' not found in $file"; missing=1; fi
done < .github/protected-fixes.txt
[ "$missing" = 0 ] || { echo "A merge removed earlier fixes - nothing was pushed or deployed."; exit 1; }
