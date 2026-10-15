#!/usr/bin/env bash
# STEP 1 - run once:  bash 1_setup_mac.sh
set -e
cd "$(dirname "$0")/backend"
[ -d .venv ] || python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
cd ../frontend
npm install
echo "Setup complete. Now run:  bash 2_start_mac.sh"
