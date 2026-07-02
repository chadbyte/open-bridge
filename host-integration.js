// Host integration — the injection seam that lets open-bridge run both
// standalone AND embedded in a host that provides extra services.
//
// open-bridge is vendor-independent AND host-independent. It deliberately
// knows NOTHING about OS users, privilege dropping, or multi-tenancy —
// that is host business logic. It only knows a few neutral capabilities it
// occasionally needs, each with a safe standalone default:
//
//   spawnWorker(spec)          launch an agent worker process
//   realHome()                 the home dir to look for ~/.claude/skills
//   readMergedMcpServers()     host-managed local MCP servers for codex
//
// A standalone consumer (a plain npm install, e.g. clayOS on a single-user
// desktop) needs none of these overridden — the defaults below just work.
//
// A host that wants control (clay's multi-user daemon) injects real
// implementations once at boot via setHostIntegration(). Crucially, ALL
// the "run this as Linux user X, drop privileges, build an isolated env"
// logic lives inside the host's spawnWorker — open-bridge hands over a
// neutral launch spec and gets back a ChildProcess. It never sees a uid.
//
// Contract (all optional; any omitted key keeps its default):
//   spawnWorker({ command, args, cwd, stdio, context }) -> ChildProcess
//     `context` is an opaque bag the caller supplied (e.g. { worker }
//     from adapterOptions.CLAUDE.linuxUser). The host interprets it; the
//     default ignores it and spawns as the current user.
//   realHome()             -> string (absolute home path)
//   readMergedMcpServers() -> { name: { command, args, env } }

var os = require("os");
var child_process = require("child_process");

var DEFAULTS = {
  // Plain spawn as the current process owner. No isolation. `context` is
  // ignored — a standalone consumer has no notion of "other users".
  spawnWorker: function (spec) {
    return child_process.spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      stdio: spec.stdio || ["ignore", "pipe", "pipe"],
      env: spec.env || process.env,
    });
  },

  // The current user's home.
  realHome: function () { return os.homedir(); },

  // No host-managed local MCP servers.
  readMergedMcpServers: function () { return {}; },
};

var current = Object.assign({}, DEFAULTS);

/** The active host integration (defaults unless a host injected its own). */
function getHostIntegration() {
  return current;
}

/**
 * Inject host capabilities. Merges over current values, so a host can set
 * only the hooks it implements. Call once at boot, before creating
 * adapters. Returns the merged integration.
 */
function setHostIntegration(hooks) {
  if (hooks && typeof hooks === "object") {
    current = Object.assign({}, current, hooks);
  }
  return current;
}

/** Restore standalone defaults (tests). */
function resetHostIntegration() {
  current = Object.assign({}, DEFAULTS);
  return current;
}

module.exports = {
  getHostIntegration: getHostIntegration,
  setHostIntegration: setHostIntegration,
  resetHostIntegration: resetHostIntegration,
  DEFAULTS: DEFAULTS,
};
