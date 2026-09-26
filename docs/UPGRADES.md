# Upgrade checks and rollback

Keep Goose and this project versioned separately. Do not modify a signed Goose
application bundle. Back up the host's integration configuration and private
handoff state before changing versions; never commit that backup.

Before enabling a new version:

1. Run this repository's tests and syntax checks.
2. In an isolated synthetic session, check `initialize`, load/new, `configOptions`
   and `session/set_config_option` with the installed Goose version.
3. Check the actual host UI: both handoff and target-model choices must be visible.
4. Switch providers, recall a synthetic marker, reload and verify history/identity.
5. Force a provider failure and confirm the original is retained. Check tool
   approvals remain approvals, rather than automatically granted permissions.

The standalone wrapper rejects a client protocol version other than 1. Target
setup also checks the returned provider choice and requires approval-mode setup
to succeed. **These are not a complete version compatibility gate**; unknown
future UI/protocol changes can still break the feature. Automated full upgrade
acceptance is future work.

If a check fails, leave handoff disabled and retain both old source sessions and
private handoff state. Revert the host adapter/configuration to the last known
working version. Bypassing the wrapper returns to the original agent only; it
does not merge the target branch's messages back into the original App.

An in-flight prompt must finish or be explicitly cancelled before replacing its
relay. Do not kill an active writer solely to install this feature.
