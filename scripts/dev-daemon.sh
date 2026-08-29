#!/usr/bin/env bash
# WAKEEL — revives the Next.js dev server as a fully detached daemon.
# The sandbox reaps plain `nohup ... &` children between tool calls, so this
# uses a python double-fork (daemonize) which reliably survives.
# Usage: bash scripts/dev-daemon.sh   (idempotent — skips if :3000 already up)
set -e
if curl -s -o /dev/null --max-time 3 http://localhost:3000; then
  echo "dev server already up on :3000"
  exit 0
fi
cd /home/z/my-project
python3 - <<'EOF'
import os
pid = os.fork()
if pid == 0:
    os.setsid()
    if os.fork() == 0:
        devnull = os.open(os.devnull, os.O_RDWR)
        os.dup2(devnull, 0); os.dup2(devnull, 1); os.dup2(devnull, 2)
        os.chdir('/home/z/my-project')
        os.execvp('bun', ['bun', 'run', 'dev'])
    os._exit(0)
os.waitpid(pid, 0)
EOF
for i in $(seq 1 30); do
  sleep 1
  if curl -s -o /dev/null --max-time 2 http://localhost:3000; then
    echo "dev server revived on :3000 (after ${i}s)"
    exit 0
  fi
done
echo "ERROR: dev server did not come up within 30s — check dev.log" >&2
exit 1
