# W2b extractor throughput

Measured with `atlas_tools/wikidata/benchmarks/measure_throughput.py`, which
generates a synthetic dump slice and streams it through `extract_entities`
(orjson field extraction only, row hashing disabled, checkpoint interval
100k). Not run in tests.

## Measured (local)

Apple-silicon laptop, warm page cache, synthetic entities (~1.5 KB/line).
Remeasured after the typed rework (NamedTuple rows + column-wise arrow
build): unchanged within noise (previously 182/298 MB/s).

| slice  | entities | elapsed | throughput |
| ------ | -------- | ------- | ---------- |
| 50 MB  | 33,082   | 0.30 s  | 165 MB/s   |
| 200 MB | 132,276  | 0.68 s  | 295 MB/s   |

Treat **~165 MB/s as a local, parse-only lower bound**. Real dump entities
are heavier (average ~7 KB/line with far more claims to skip past), so real
parse throughput will be somewhat lower per entity but similar per byte;
the dominant real-world costs are download bandwidth and bzip2
decompression, which this benchmark deliberately excludes.

## Projection template

```
projected_parse_hours = dump_uncompressed_MB / measured_MB_per_s / 3600
                      = 140_000 / 165 / 3600  ≈ 0.24 h  (parse only)
```

End-to-end wall time is bounded by the slowest pipeline stage of
`download | parallel bzip2 -dc | wikidata entity-manifest --input -`:

- download: ~40 GB compressed; ≈ 0.1 h at 1 Gbps, longer if the mirror
  throttles;
- decompression: single-stream `bzip2 -dc` (~20 MB/s output) would dominate
  at ~2 h — use `lbzip2`/`pbzip2`, which scale to roughly the parse rate on
  8+ cores;
- parse: ~0.2 h at the measured local rate.

**Honest projection: ~0.5–2 h end to end** on a well-provisioned host with
parallel bzip2; a laptop on home bandwidth would instead be dominated by the
download (many hours).

## Deployment note

Run on a high-bandwidth EU host near the Wikimedia dump mirrors (the dump is
served from Europe; transatlantic fetches routinely halve throughput). The
dump is never written to disk: peak local storage is the manifest parquet
plus part files/checkpoints. Resume after interruption uses the checkpointed
byte offset via an HTTP range request (`curl -r <offset>- | lbzip2 -dc | …`).
