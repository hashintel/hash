# Brunch configs

The wire facts of reaching the Brunch agent over HTTP — its identity request headers, its agent routes, and the response headers a cross-origin browser must be able to read — in one dependency-free package. `@hashintel/brunch-agent` re-exports them for Brunch and its browser clients; hash-api imports them from `@local/brunch-configs/wire` directly, so its authenticated hop to Brunch shares them without depending on Brunch's client, UI or Petrinaut.
