# Integration

## Mock Data

Mock data may be inserted by running:
```
yarn mock-data
```
Ensure that the API and database are running (see the backend
[README](../backend/README.md) for details).

## Integration tests

Command:
```
yarn test
```

Integration tests run in a separate database named `integration_tests`.
This database is cleared, and the schema re-created, when the tests begin.