# Singer Target

Introduced with [Learn about how we interact with Graph API/Model classes and setup initial code for target](https://app.asana.com/0/1201959586244671/1202005421447204/f).

This module has it's own cli to be used as a Singer Target.

- Located under hash/, because this uses model classes
  - Model class methods will continue to be pretty stable (create/update properties)
  - Basic functions for links and similar
  - GraphQL as likely to change as models
- Will interact directly with hash-app's postgresql database through the model classes.
- Target must be configured to use same postgres connection info as Hash App
- This seems kinda weird if you're considering publishign the target for others to
  use in the future in their own Meltano pipelines or whatever, because they would have
  to have pg connection info for our cloud instance in order to use their own singer
  tools with hosted warehouse offering. This opportunity would lead us to either:
  A. Interact with hash-app through an externally facing API with its own auth setup
  B. Use Row-Level-Security in Postgres to ensure that we can lock down the client
  connection info's user to only affect datasets in their own workspace etc.

Considerations:

- Future: Need to be able to query for a specific entity with a key property equal to X
- e.g. Entity versioning / de-duplication on ingestion.
