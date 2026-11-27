#!/usr/bin/env bash
set -euo pipefail
NAME=ethx-hrms
URL=https://hr.ethxsoftcon.com/
echo "Deploying $(git log -1 --format='%h %s')"
if docker image inspect "$NAME:latest" >/dev/null 2>&1; then docker tag "$NAME:latest" "$NAME:previous"; fi
docker build -t "$NAME:latest" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped -p 8095:8095 "$NAME:latest"
code=000
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$URL" || true)
  [ "$code" = "200" ] && break
  sleep 3
done
if [ "$code" != "200" ]; then
  echo "::error::Health check failed (HTTP $code) - rolling back to the previous image"
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" --restart unless-stopped -p 8095:8095 "$NAME:previous"
  exit 1
fi
docker image prune -f >/dev/null 2>&1 || true
echo "Deployed OK - $URL answers 200"
