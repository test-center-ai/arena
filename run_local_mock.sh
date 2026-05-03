#!/bin/bash

echo "================================================"
echo " Starting Arena AI Local Mock Mode (Relay Agents)"
echo "================================================"

# Kill any existing mock agents
pkill -f "relay_agent.py" || true

# Start Defender (VM Alpha)
python3 relay_agent.py --vm-id vm-a --role defender --dashboard http://127.0.0.1:9020 --port 9030 &
PID_A=$!

# Start Attacker (VM Beta)
python3 relay_agent.py --vm-id vm-b --role attacker --dashboard http://127.0.0.1:9020 --port 9031 &
PID_B=$!

echo "Local agents are running on ports 9030 and 9031."
echo "Press Ctrl+C to stop both agents."

# Wait and cleanup on exit
trap "kill $PID_A $PID_B 2>/dev/null; exit" SIGINT SIGTERM
wait $PID_A $PID_B
