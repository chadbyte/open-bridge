# open-bridge

Vendor-independent **and** host-independent runtime abstraction for AI
coding agents. One small contract (`interface.js`) over Claude (Claude
Agent SDK) and Codex (app-server protocol), so a consumer drives either
vendor through the same `createQuery` / event-stream shape.

## The single source of truth

open-bridge is the canonical home of the Claude/Codex bridge logic. It is
designed to be consumed two ways from one codebase:

- **Standalone** — a plain install (e.g. clayOS on a single-user
  desktop, or the Chrome-extension native host). No host services; the
  no-op defaults in `host-integration.js` apply: no OS-user isolation,
  the worker runs as the current process owner, `os.homedir()` for the
  home path, no host-managed local MCP servers.

- **Embedded in a host** — a multi-user daemon (clay) that provides
  OS-level services. The host injects them once at boot via
  `setHostIntegration()`; nothing else changes.

Historically the bridge lived inside clay's monorepo as `lib/yoke` and
reached *up* into clay-internal modules (`../../os-users`,
`../../build-user-env`, `../../config`, `../../mcp-local`). That coupling
is gone: open-bridge reaches *down* through a documented injection seam,
so both clay and clayOS build on this one package instead of each
carrying a forked copy.

## Usage

Standalone (no host integration needed):

```js
const { createAdapter, checkAuth } = require('@open-bridge/core');
const adapter = createAdapter({ vendor: 'codex', cwd: process.cwd() });
const q = await adapter.createQuery({ model: 'gpt-5.5', systemPrompt: '…' });
q.pushMessage('hello');
for await (const ev of q) { /* ev.yokeType: text_delta | result | … */ }
```

Embedded host (inject services once at boot, before creating adapters).
open-bridge stays ignorant of OS users — a host that wants process
isolation puts all of it inside its own `spawnWorker`:

```js
const openBridge = require('@open-bridge/core');
openBridge.setHostIntegration({
  // open-bridge hands you a neutral launch spec + an opaque context;
  // you decide how the process runs (as another user, sandboxed, …).
  spawnWorker: (spec) => {
    // e.g. resolve spec.context.worker → an OS user, build env, setpriv…
    return require('child_process').spawn(spec.command, spec.args, {
      cwd: spec.cwd, stdio: spec.stdio, env: /* your env */ process.env,
    });
  },
  realHome:             () => '/home/loginuser',
  readMergedMcpServers: () => ({ name: { command, args, env } }),
});
```

Any omitted hook keeps its standalone default. See `host-integration.js`
for the full contract. Note there is intentionally **no** OS-user concept
in the contract — that vocabulary belongs to the host, not to a bridge
over coding agents.

## Vendor routing

Vendor is selected by the caller (`createAdapter({ vendor })`). A common
policy is to route by model id — Claude model names (`sonnet`, `opus`,
`haiku`, `claude-*`) to the claude adapter, everything else to codex —
but that policy lives in the consumer, not here.

## Layout

```
index.js             public entry: createAdapter, checkAuth,
                     setHostIntegration, …
interface.js         the Adapter / QueryHandle contract
host-integration.js  the injection seam (defaults + setHostIntegration)
instructions.js      cross-vendor project-instruction merge
codex-app-server.js  codex app-server JSON-RPC client
mcp-bridge-server.js clay-tools MCP bridge
adapters/
  claude.js          Claude Agent SDK adapter (+ worker isolation)
  claude-worker.js    isolated SDK worker process
  codex.js           Codex app-server adapter
```

`[YOKE]` prefixes in some log lines are the original internal name.
