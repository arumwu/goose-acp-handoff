# Goose ACP Handoff

**Experimental · 0.1.0 · Not an official Goose project**

Manually hand an ACP conversation to another provider when you want to change
models or your current provider is out of quota. The client keeps the original
conversation ID; a separate Goose session handles subsequent messages.

**繁體中文：手動選擇接棒模型。原對話保留，各家工作階段仍獨立；不是把不同 App 的資料庫合併。**

## What works / what is not verified

- Behavioral tests cover per-session isolation, provider failure rollback,
  busy-session rejection, history bounds, reconnect replay, and uncertain submissions.
- A local Goose 1.52.0 integration successfully handed synthetic text to MiniMax
  China / MiniMax-M3 and recalled a marker available only in the previous history.
- A local WebSocket relay integration verified selector exposure, the same visible
  session ID, reconnect history, and hiding the context packet from the client.
- The **standalone wrapper and generic integration code in this repository are
  experimental**. Native Goose UI rendering, production deployment, Claude/Codex
  live handoff, Discord integration and compatibility with future Goose releases
  have not been accepted end-to-end. No claim of official upstream support.

## Requirements

Node.js 22+, a separately installed `goose` CLI, configured provider credentials,
and an ACP client that renders `configOptions` and sends
`session/set_config_option`. Credentials stay with Goose; this project does not
ask for API keys or include any account configuration.

There are no npm runtime dependencies and no npm package publication yet.

```sh
git clone https://github.com/arumwu/goose-acp-handoff.git
cd goose-acp-handoff
npm test
npm run check
```

## Run as a stdio ACP wrapper

Configure your ACP host to run the following, using a private persistent directory
**outside this repository** for handoff state:

```sh
ACP_HANDOFF_STATE_DIR=/absolute/private/handoff-state \
  node /absolute/path/goose-acp-handoff/src/cli.mjs -- goose acp
```

The command after `--` is the original ACP agent. `goose acp` is an example;
other ACP agents can be wrapped if they support the required session methods.
Set `GOOSE_HANDOFF_COMMAND` to the Goose executable path if it is not on PATH.

Open or create a conversation, then use **接棒模型** (handoff provider). The
selector offers MiniMax, Codex ACP and Claude ACP by default. Selecting a target
prepares a new session with approval mode; **history is sent to the selected
provider with your next message**, not immediately on selection. The target's own
model choices are exposed separately as **目前代理模型**.

Only select providers you have actually configured. A listed option is not proof
of authentication, available quota or model compatibility. Same-provider model
changes do not necessarily solve an account-wide quota limit.

For custom providers, supply a JSON file through `ACP_HANDOFF_TARGETS_FILE`:

```json
[
  {"value":"custom_minimax_cn","name":"接棒：MiniMax 中國站"},
  {"value":"codex-acp","name":"接棒：Codex"},
  {"value":"claude-acp","name":"接棒：Claude"}
]
```

These IDs must match the provider IDs in your Goose configuration. The wrapper
never creates credentials or changes the global default provider.

## Connecting it to Goose Desktop

The module can be embedded in a local authenticated ACP relay used by Goose
Desktop. See [the adapter contract](docs/INTEGRATION.md). This is **not** a
one-click Desktop plugin, and the CLI wrapper is not a WebSocket server. Desktop
configuration depends on the installed Goose version; do not paste a stdio
command into an HTTP server address field.

No `.app` bundle modification is required. An app update normally does not remove
this separate project, but that does **not** guarantee protocol or UI compatibility.
See [upgrade checks and rollback](docs/UPGRADES.md).

## Boundaries

- Only user/assistant **text** observed in this conversation is handed off.
  Attachments, tool results, hidden reasoning and arbitrary project files are not.
- A successful source load is required. Completeness is limited by what the source
  agent replays; this module cannot recover history that the source does not expose.
- Histories over 200,000 characters retain a complete local text archive (0600).
  The next provider receives a labeled excerpt: the first 12,000 and last 148,000
  characters, plus the archive path. This is not a complete summary; omitted
  decisions require reading the archive with the existing tool permissions.
  Attachments, tool results and hidden reasoning are not exported.
- The chosen provider receives the transferred text. Review the conversation for
  sensitive data before selecting a different provider; there is no universal
  secret detector or automatic redaction claim.
- State files contain conversation text in plaintext with restrictive filesystem
  permissions. Keep them private, off Git and out of shared/synced directories.
- The original provider's App will not automatically show the other provider's
  replies. Goose can display them through this relay layer.
- No automatic fallback, automatic retry, or silent permission escalation.
- A failed/uncertain prompt blocks blind retry. Re-select a handoff target after
  checking the outcome. This does not undo tools that might already have executed.
- The wrapper allows one process per state directory. A crash can leave
  `.owner-lock`; remove that lock only after confirming the owner process is gone.
- The source agent remains installed and independent. Do not delete original
  sessions while relying on the relay's metadata or history.

## Development

```sh
npm test
npm run check
```

Tests use fake agents and temporary synthetic state, not real accounts. Local live
integration results above are reported separately and are not run in CI. This
release has had a scoped source/secret check, not a comprehensive security audit.

Protocol reference: [ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options).

MIT licensed. Contributions and narrowly scoped compatibility reports are welcome.
