# Integration

## Mock Data

The [`subgraph`](src/tests/subgraph) module contains two subdirectories, `pass` and `fail`, each of which houses snapshots of the graph. The integration test suite is able to restore these snapshots to the graph, and run the tests against them. In most cases, this requires a clean graph, so the test suite will create a new graph, and restore the snapshot to it. Because of this, every test should ensure that the graph is cleaned up after it has run.

To create a new snapshot of the existing graph the [`@apps/hash-graph`] package should be used. While it is also possible to create snapshots by hand doing so is comparatively error prone, and should be avoided.
To create a snapshot make sure the Graph contains the desired data and run the following command from the [`@apps/hash-graph`] package:

```bash
just run snapshot dump
```

This will print the snapshot to the terminal. Copy the output and paste it into the desired snapshot file. As an alternative you can directly pass it into a file:

```bash
just run snapshot dump > ../../tests/hash-backend-integration/src/tests/subgraph/pass/my-snapshot.jsonl
```

To see a list of available command line arguments pass `--help` after the desired command, e.g.:

```bash
just run snapshot --help
```

or

```bash
just run snapshot dump --help
```

[`@apps/hash-graph`]: ../../apps/hash-graph

## Integration tests

See root `README.md` → Testing.
