# Integration

## Mock Data

Mock data may be inserted by running:

```
yarn mock-data
```

Ensure that the API and database are running (see the backend
[README](../backend/README.md) for details).

## Integration tests

First, ensure that the API and database are running and connected to the test database.
Run `yarn serve:hash-backend-test` from the root to do this.

Command:

```
yarn test
```

Integration tests run in a separate database named `integration_tests`.
This database is cleared, and the schema re-created, when the tests begin.

The environment variable `HASH_DEV_INTEGRATION_EMAIL` may be set to
a valid email address, to which a test email will be sent. This test
will be skipped if the variable is not set.

Don't forget to restart the backend after testing with the regular db (`yarn serve:hash-backend`).
