# Brunch agent application

## Run the process-model panel locally

From the repository root, make `ANTHROPIC_API_KEY` available in the environment and run:

```sh
yarn dev:brunch
```

The command starts the Brunch server at `http://127.0.0.1:4321` and the real Petrinaut website at
`http://127.0.0.1:4915`. The website proxies `/api/chat` to Brunch, where the panel runs the SDCPN
process-model elicitor.

Conversations persist in `apps/brunch-agent/.data-wipe-me/conversations.db`. Owned target documents
persist as per-document JSON files under `apps/brunch-agent/.data-wipe-me/target-documents/`.
`BRUNCH_DEV_DB_PATH` and `BRUNCH_DEV_TARGET_DOCUMENT_DIR` override those local paths.
