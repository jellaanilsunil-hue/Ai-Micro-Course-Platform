#!/usr/bin/env bash
# STEP 2 - run every time:  bash 2_start_mac.sh   (Ctrl+C stops both servers)
cd "$(dirname "$0")"
(cd backend && source .venv/bin/activate && python app.py) &
BACK=$!
(cd frontend && npm run dev) &
FRONT=$!
trap "kill $BACK $FRONT 2>/dev/null" EXIT
sleep 12
open http://localhost:5173 2>/dev/null || xdg-open http://localhost:5173 2>/dev/null
echo "Website: http://localhost:5173   (Ctrl+C to stop)"
wait
