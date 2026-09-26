# Embedding in an existing ACP relay

The host must already provide local authentication, origin checks, request ID
routing, lifecycle cleanup and an upstream ACP connection. Do not expose this
module as an unauthenticated network service.

```js
import { HandoffStore, ManualHandoff } from '../src/manual-handoff.mjs';

// Once per host process, not per connection.
const store = new HandoffStore('/absolute/private/handoff-state');

// Once per authenticated client connection.
const handoff = new ManualHandoff({
  store,
  send: message => sendToClient(message),
  init: () => originalClientInitialization,
  isBusy: sessionId => originalAgentIsRunning(sessionId),
  cwdFor: sessionId => authoritativeSessionMetadata(sessionId)?.cwd,
});

async function fromClient(message) {
  if (handoff.reply(message)) return; // Routes target permission responses.
  if (await handoff.handle(message)) return;
  handoff.track(message);
  sendToOriginalAgent(message);
}

function fromOriginalAgent(message) {
  if (!message.method && message.result?.sessions) {
    message.result.sessions = message.result.sessions.filter(
      session => !store.hidden(session.sessionId)
    );
  }
  sendToClient(handoff.outgoing(message));
}

// On disconnect:
// handoff.close();
```

The helper functions in this contract are supplied by your host; this snippet is
not a standalone network server. The runnable stdio adapter is `src/cli.mjs`.

Retain the original `initialize` client capabilities. Relay permission requests
to that same client and never auto-grant them. `cwdFor` must come from the selected
session, not another project's current directory.

All live clients in a host must share one store/lock set. Only a single process
may own a state directory. The supplied CLI enforces this with an owner lock;
embedded hosts must provide equivalent ownership.

A Discord or other message source must call this same handoff layer once a branch
exists. Bypassing it and sending straight to the old session splits the
conversation. Discord integration is deliberately not included in this public
module's acceptance claims.

For federated IDs prefixed `external-claude:` or `external-codex:`, the native
Goose provider/model dialog is supported: selecting the same provider is a no-op;
selecting another configured target creates a handoff branch. The source adapter
still needs to translate provider-specific options such as Claude `effort` versus
Goose `thinking_effort` and report the current model in session metadata.
