# Singer Target

## Usage

Ensure you've got the external services running & the seed data inserted.

You technically don't need to have front-end or back-end running, since the target
connects directly to the postgres database.

Try this:

```sh
# set up codebase
yarn

# create your own .env file to customize
cp .env .env.local

# run sample ingest data through target
yarn run test-github-to-target

# or directly run:
cat ./test-data/tap-github--example/tap-github--example/tap-github--ingest--bonsai.jsonl | node ./bin/singer-target.js
```

## Development History

Introduced with [Learn about how we interact with Graph API/Model classes and setup initial code for target](https://app.asana.com/0/1201959586244671/1202005421447204/f).

This module has its own cli to be used as a Singer Target.

- Located under hash/, because this uses model classes
  - Model class methods will continue to be pretty stable (create/update properties)
  - Basic functions for links and similar
  - GraphQL as likely to change as models
- Will interact directly with hash-app's postgresql database through the model classes.
- Target must be configured to use same postgres connection info as Hash App
- This seems kinda weird if you're considering publishing the target for others to
  use in the future in their own Meltano pipelines or whatever, because they would have
  to have pg connection info for our cloud instance in order to use their own singer
  tools with hosted warehouse offering. This opportunity would lead us to either:
  A. Interact with hash-app through an externally facing API with its own auth setup
  B. Use Row-Level-Security in Postgres to ensure that we can lock down the client
  connection info's user to only affect datasets in their own workspace etc.

Considerations:

- Future: Need to be able to query for entities with a key property equal to X and of
  type Y
- e.g. Entity versioning / de-duplication / updating on ingestion.
