# SecretStorage credential lifecycle (DEL-88)

Requires Obsidian 1.11.4+ on desktop and mobile (`App.secretStorage` public API). Persistent fine-grained PATs and broker grants use separate generated `squido-githubpat-<uuid>` / `squido-brokergrant-<uuid>` names. Plugin settings contain only reference IDs and non-secret connection metadata. Installation-token keys are rejected by this store; no installation token is persisted.

Startup migrates legacy `githubToken`, `session.broker_grant`, or `connection.broker_grant` before starting any publishing or auth handlers. Writes must read back the exact value before settings are scrubbed. Failure aborts plugin startup without a plaintext fallback or erasing the original legacy settings. Existing legacy disk copies therefore remain until migration succeeds; backups are not rewritten. Partial failures can leave an unreferenced secret in Obsidian's storage. Migration is not a cross-store transaction or proof of disk durability: the public API's set/get methods are synchronous and expose no flush acknowledgement.

Auth setup and grant rotation store/verify the grant before recording connected metadata. Local disconnection clears the named value using `setSecret(id, "")` (there is no public delete method), verifies it is empty, then removes the reference. GitHub revocation is separate from local forgetting. If remote revocation fails, the existing device-disconnect warning remains. If SecretStorage fails, no successful local-clear claim is made. PAT forgetting does not revoke GitHub access; revoke the PAT under GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens.

Do not infer encrypted-at-rest storage, Keychain protection, per-plugin isolation, or synchronization to another device. SecretStorage names and the Obsidian JavaScript runtime are shared; community plugins may access credentials. Keep repository scopes narrow, choose expiration, trust installed plugins, and revoke credentials if compromised. Device-specific secrets may need to be entered/re-authorized on each device. No companion app is required.

## Automated validation

`pnpm test`, `pnpm run typecheck`, `pnpm run build`.

Mocked public-API tests cover migration/reload, failed and silently dropped writes, failed reads without error leakage, rotation, local clearing, simultaneous credential writes, raw-settings rejection, auth completion ordering, and direct PAT Contents API publishing. They do not establish platform encryption or live GitHub permissions.

## Manual acceptance still required (Jon; no live GUI control in agent scope)

On macOS and iOS running 1.11.4+:

- Migrate a disposable legacy PAT/grant and inspect plugin data for reference-only persistence; reload and verify credentials are read through SecretStorage.
- Verify failed/locked/missing storage disables initialization without erasing legacy settings; recover and reload.
- Exercise connection completion, verification/rotation, expiry, device repair, and local/remote revocation; verify no credentials in diagnostics/logs.
- Save/replace/forget a disposable fine-grained PAT and confirm GitHub-side expiration/revocation behavior.
- Inspect actual platform storage separately before documenting encryption guarantees. This change makes no such guarantee.

GitHub App publishing/write-scoped token vending is not implemented by DEL-88. The pre-existing app flow proves authorization; PAT publishing is still the publishing path until separately implemented.
