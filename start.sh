#!/bin/bash
# Start the Multi-Agent Digest dashboard

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting API server on http://localhost:8000 ..."
python3 "$ROOT/api/main.py" &
API_PID=$!

echo "Starting frontend on http://localhost:3000 ..."
cd "$ROOT/frontend" && npm run dev &
FRONTEND_PID=$!

echo ""
echo "Dashboard: http://localhost:3000"
echo "API docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $API_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM
wait
