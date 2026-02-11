## Rewrite BitMatrix and SparseBitMatrix with contiguous backing storage

**BitMatrix** is now backed by a single contiguous `Vec<Word, A>` with zero-copy `RowRef`/`RowMut` view types. **SparseBitMatrix** uses an arena-backed design with a single `Vec<Word, A>` for all row data and a free-list for slot recycling, replacing the previous one-heap-allocation-per-row approach. Both types support custom allocators.

### Performance

Benchmarked against the previous implementation across sizes 64, 200, and 1000:

| Operation | Improvement |
|---|---|
| Dense insert | At parity (±1%) |
| Dense contains | 5–19% faster |
| Dense union_rows | 1.8–2.0x faster |
| Dense iter_row | At parity |
| Sparse insert | 6–42% faster |
| Sparse union_rows | 1.5–3.8x faster |
| Sparse clear+reinsert | 2.0–2.3x faster (sizes ≥ 200) |

Additionally adds bit-parallel Warshall transitive closure and reflexive transitive closure for square matrices.

### Verification

Correctness was verified via property-based testing against the previous implementation — random sequences of insert, remove, contains, and union_rows operations on both old and new matrices, asserting identical results at every step and in a full matrix comparison at the end. Additional proptests verify dense-vs-sparse equivalence and the excess-bits invariant (padding bits in final words are always zero). 62 tests total including edge cases for zero-size matrices, word boundary alignment, self-referential row operations, and out-of-bounds panics.
