#!/usr/bin/env bash
# Quick check that the MCP server works and can see your data.
#   ./mcp/smoke-test.sh            -> uses the real app data dir
#   FLOWSTACK_DATA_DIR=... ./mcp/smoke-test.sh  -> uses a sandbox copy
set -euo pipefail
cd "$(dirname "$0")/.."

printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"describe_workspace","arguments":{}}}' \
| node mcp/server.js | node -e '
require("readline").createInterface({input:process.stdin}).on("line",l=>{
  const m = JSON.parse(l);
  if (m.error) { console.log("id " + m.id + "  ERROR: " + m.error.message); return; }
  if (m.id === 1) console.log("connected:  " + m.result.serverInfo.name + " v" + m.result.serverInfo.version);
  if (m.id === 2) console.log("tools:      " + m.result.tools.length + " available");
  if (m.id === 3) {
    const d = JSON.parse(m.result.content[0].text);
    console.log("methodology:" + " " + d.configuration.methodology);
    console.log("permissions:" + " " + JSON.stringify(d.configuration.mcp));
    console.log("tasks:      " + d.totals.tasks + " (" + d.totals.backlog + " in backlog)");
    console.log("sprints:    " + d.sprints.map(s => s.name + " [" + s.status + "]").join(", "));
    console.log("team:       " + d.team.map(u => u.name).join(", "));
  }
})'
