# Ledger pipeline: open issues

What the first version leaves undecided or does not do. Each entry says what is chosen for now and what stays open. What is decided is in `plan.md` and in `spec/decisions.md`, and is not repeated here.

Rewritten on 2026-11-19, after the design and the spec were agreed. Earlier versions of this file listed questions that are decided now: how a refused write is handled, what a bulk request does when the Graph refuses it, and where staging lives.

## For the team

### How the sync table and the capture tables are stored

**Linear:** BE-1162, BE-1175.

**Decided:** Delta, in the integration's bucket, partitioned by run (`spec/decisions.md`, D17), read and written through DuckDB (D18). One module, `lake/`, reads and writes every table, so a change of format stays inside it.

**Open:**

- A write that crashes before its commit may leave data files that no commit names. `deltalake-core` left them. Whether DuckDB's Delta writer leaves them, and whether it removes the files of a commit that fails, is not verified. Nothing cleans them up yet.
- The lake writes a checkpoint when the number of runs in a table is a multiple of 100, and logs a checkpoint that fails. It does not clean up the log. A continuous sync would need both tuned.
- The checkpoint can be skipped. The count is of runs with rows: a run without rows commits nothing and does not count. And each append counts the runs after its own commit. If another process commits a run between the two, the count passes the multiple, and no process writes a checkpoint at it. The log then grows until the next multiple.

### Link changes in incremental runs

**Linear:** BE-1174. **Under discussion:** [Links From Joins](https://claude.ai/artifact/PzCHqfjKBYHyWpH5DygnJW).

**Chosen for now:** a link takes the kind of the row it comes from. An inserted row creates the link, an updated row updates it, a deleted row archives it.

**Open:** two cases need the old ends of a link, which a changed row does not have.

- A row whose link target changes gets the new link. The old link stays live.
- A delete row that no longer holds the link's columns cannot name the link, so the link is not archived.

Labs handles both, because it captures the whole source and compares the pairs of ends with those of the previous run. Three ways to get there:

- The sender delivers the row as it was before the change. This works only for sources that know the old values.
- Prepare keeps the last known row per key in the bucket and looks the old row up.
- The version of Prepare for full captures, which ports the labs comparison.

### Joins and aggregations in incremental runs

**Linear:** BE-1173, BE-1164, BE-1165.

**Chosen for now:** Prepare refuses a definition in which a pipeline reads a second table (`spec/decisions.md`, D14). An incremental capture holds only the rows that changed, so a join would see only the changed rows of each table and give wrong results without an error.

**Open:**

- An aggregation over one table is not detected. Counting the orders of a customer counts only the orders that changed in this run. Finding it would mean parsing the SQL.
- How joins become possible: the sender delivers every row a join needs, the data collection service joins before it sends, or Prepare keeps the last known row per key.

### A source that cannot tell an insert from an update

**Linear:** BE-1163.

**Chosen for now:** `_change` has three values, `insert`, `update` and `delete`. A wrong value does not lose data: Send follows a create that finds the entity with a patch, and an update that does not find it with a create, and counts both cases in `run.json`. But each such row costs a refused batch and single requests.

**Open:** a fourth value for "this is the record as it is now", and where the pipeline then finds out whether the entity exists. A source that reports only changed records also cannot report a deleted one. That needs a full capture.

### Removing a property

**Chosen for now:** an update sets each property the row holds. A value that becomes empty at the source is left out of the row, so the property keeps its old value in the Graph.

**Open:** how a removal is expressed, for example a "remove" for each mapped property that is empty in the row.

### Capture once a data collection service exists

**Chosen for now:** Capture runs one DuckDB query per table, which its caller reads from the integration's operator configuration, and appends the rows to the table's capture table (`spec/decisions.md`, D18). A query can read local files, files in a bucket or another Delta table.

**Open, for when the service is designed:**

- Where the queries of an integration are kept, and who may change them. Only the tests write them today (`tests/integrations/graph/ledger/capture.yaml`).

- What the service pushes, and who creates the run.
- What happens to data that arrives while a run is active. Runs are strictly sequential, so the data has to wait somewhere.
- Whether Capture stays a stage, or becomes the endpoint that accepts a push.

## Limits of the first version

### An entity deleted and inserted again in one run

Send delivers all creates before all archives. An entity that is deleted and then inserted again in the same run is created first and archived second, so it ends up archived. Neither Prepare nor Send checks for it.

**Open:** Prepare refuses such a run, or Send keeps the captured order for an entity across kinds.

### A run that fails for good blocks its integration

A failure that a rerun cannot fix is written into `run.json`, and the run stays the active run (`spec/decisions.md`, D7). Every later start is refused. Clearing it means editing `current.json`, or removing the `failure` part and running the stage again, by hand.

**Open:** a command to give up a run, and what giving up means for rows the run wrote to the sync table and did not send.

### Two attempts of one stage at the same time

**Covered:** a stage works only on the run that `current.json` names, and it saves `run.json` only if nobody changed the file since the stage read it. Of two attempts, the second to finish fails and overwrites nothing. Two attempts that append the same run to a table keep the rows of the first commit (`spec/decisions.md`, D19).

**Open:** both attempts do their work before either saves. Two Sends at once send every batch twice. The upserts keep the Graph correct, but a queue that delivers a message twice would need a claim on the run before the work starts.

### A Graph that does not recover

- If the Graph is not available on every attempt, Send returns an error each time and records nothing. Nothing in the pipeline raises this.
- If the Graph answers every request with 500, Send records every entity as failed and the run completes. The Graph answers a link with a missing end with 500, so a 500 cannot be read as "not available".

**Open:** two changes to the Graph API would remove most of Send's fallback: an error for a bulk request that names the entities that failed, and statuses that tell a refused entity from a server fault.

### What the Graph answers, observed

How the Graph answers bulk and single writes is read from its code (`background/spikes.md`). The test of the whole pipeline, `csv_to_graph`, runs against a Graph it serves, but sends only creates that succeed. No refused bulk request, 409 or 404 is observed yet.

### A run's rows are held in memory

Prepare builds all rows of a run before it writes them, and Send reads all of them before it sends (`spec/decisions.md`, D5). A run of several million rows needs gigabytes of memory.

**Open:** writing and reading in pieces, which changes `SyncTable::write` and `SyncTable::read`.

### The lake's DuckDB

- The lake installs the DuckDB extensions `httpfs` and `delta` from the network each time it opens (`INSTALL httpfs; … INSTALL delta;` in `LakeSettings::open`). A stage therefore needs DuckDB's extension repository, and fails with a retryable error without it. The extensions should be part of the image the stages run in.
- The lake's DuckDB is in memory and has none of the workspace's limits: no memory limit, no limit on its temporary directory, no thread count. A large capture or a large sync table read can take all the memory of the process.
- Capture runs each query into a temporary table of the lake before it appends the rows, so that a failing query writes nothing. The whole capture of one table is therefore held in DuckDB at once.

## Kept for later

- **Periodic snapshots of the sync table.** A job merges the rows of each entity into one table of current values. Reading the state at a run then starts from the latest snapshot.
- **The version of Prepare for full captures,** with hash and diff, and an initial sync.
- **Restore and reconcile,** which labs has as kinds of run.
- **Running the stages from a queue,** and the orchestration interface that is in review (`background/flow-map.md`, "Work in review").
