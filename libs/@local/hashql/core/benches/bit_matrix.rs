#![expect(clippy::significant_drop_tightening)]
use core::hint::black_box;

use codspeed_criterion_compat::{
    BatchSize, BenchmarkId, Criterion, criterion_group, criterion_main,
};
use hashql_core::{
    id::{Id as _, bit_vec},
    newtype,
};

newtype!(struct BenchId(usize is 0..=usize::MAX));

// =============================================================================
// Dense BitMatrix — old vs new
// =============================================================================

fn dense_insert(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/dense/insert");

    for &size in &[64, 200, 1000] {
        group.bench_with_input(BenchmarkId::new("old", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || bit_vec::BitMatrix::<BenchId, BenchId>::new(size, size),
                |mut matrix| {
                    for row in 0..size {
                        for col in (0..size).step_by(7) {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
                        }
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });

        group.bench_with_input(BenchmarkId::new("new", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || bit_vec::matrix::BitMatrix::<BenchId, BenchId>::new(size, size),
                |mut matrix| {
                    for row in 0..size {
                        for col in (0..size).step_by(7) {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
                        }
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });
    }

    group.finish();
}

fn dense_contains(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/dense/contains");

    for &size in &[64, 200, 1000] {
        let mut old_matrix = bit_vec::BitMatrix::<BenchId, BenchId>::new(size, size);
        let mut new_matrix = bit_vec::matrix::BitMatrix::<BenchId, BenchId>::new(size, size);
        for row in 0..size {
            for col in (0..size).step_by(3) {
                old_matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
                new_matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
            }
        }

        group.bench_with_input(
            BenchmarkId::new("old", size),
            &old_matrix,
            |bencher, matrix| {
                bencher.iter(|| {
                    let mut count = 0_u32;
                    for row in 0..size {
                        for col in 0..size {
                            if matrix.contains(BenchId::from_usize(row), BenchId::from_usize(col)) {
                                count += 1;
                            }
                        }
                    }
                    black_box(count)
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("new", size),
            &new_matrix,
            |bencher, matrix| {
                bencher.iter(|| {
                    let mut count = 0_u32;
                    for row in 0..size {
                        for col in 0..size {
                            if matrix.contains(BenchId::from_usize(row), BenchId::from_usize(col)) {
                                count += 1;
                            }
                        }
                    }
                    black_box(count)
                });
            },
        );
    }

    group.finish();
}

fn dense_union_rows(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/dense/union_rows");

    for &size in &[64, 200, 1000] {
        group.bench_with_input(BenchmarkId::new("old", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || {
                    let mut matrix = bit_vec::BitMatrix::<BenchId, BenchId>::new(size, size);
                    for col in (0..size).step_by(3) {
                        matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
                    }
                    matrix
                },
                |mut matrix| {
                    for row in 1..size {
                        matrix.union_rows(BenchId::from_usize(0), BenchId::from_usize(row));
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });

        group.bench_with_input(BenchmarkId::new("new", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || {
                    let mut matrix =
                        bit_vec::matrix::BitMatrix::<BenchId, BenchId>::new(size, size);
                    for col in (0..size).step_by(3) {
                        matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
                    }
                    matrix
                },
                |mut matrix| {
                    for row in 1..size {
                        matrix.union_rows(BenchId::from_usize(0), BenchId::from_usize(row));
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });
    }

    group.finish();
}

fn dense_transitive_closure(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/dense/transitive_closure");

    for &size in &[16, 64, 200] {
        group.bench_with_input(
            BenchmarkId::new("warshall", size),
            &size,
            |bencher, &size| {
                bencher.iter_batched(
                    || {
                        let mut matrix =
                            bit_vec::matrix::BitMatrix::<BenchId, BenchId>::new(size, size);
                        // Chain: 0 → 1 → 2 → ... → n-1
                        for index in 0..size - 1 {
                            matrix
                                .insert(BenchId::from_usize(index), BenchId::from_usize(index + 1));
                        }
                        matrix
                    },
                    |mut matrix| {
                        matrix.transitive_closure();
                        black_box(matrix);
                    },
                    BatchSize::SmallInput,
                );
            },
        );
    }

    group.finish();
}

fn dense_row_iter(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/dense/iter_row");

    for &size in &[64, 200, 1000] {
        let mut old_matrix = bit_vec::BitMatrix::<BenchId, BenchId>::new(size, size);
        let mut new_matrix = bit_vec::matrix::BitMatrix::<BenchId, BenchId>::new(size, size);
        for col in (0..size).step_by(5) {
            old_matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
            new_matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
        }

        group.bench_with_input(
            BenchmarkId::new("old", size),
            &old_matrix,
            |bencher, matrix| {
                bencher.iter(|| {
                    let mut count = 0_u32;
                    for _ in matrix.iter(BenchId::from_usize(0)) {
                        count += 1;
                    }
                    black_box(count)
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("new", size),
            &new_matrix,
            |bencher, matrix| {
                bencher.iter(|| {
                    let mut count = 0_u32;
                    for _ in matrix.iter_row(BenchId::from_usize(0)) {
                        count += 1;
                    }
                    black_box(count)
                });
            },
        );
    }

    group.finish();
}

// =============================================================================
// Sparse BitMatrix — old (per-row DenseBitSet) vs new (arena-backed)
// =============================================================================

fn sparse_insert(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/sparse/insert");

    for &size in &[64, 200, 1000] {
        group.bench_with_input(BenchmarkId::new("old", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || bit_vec::SparseBitMatrix::<BenchId, BenchId>::new(size),
                |mut matrix| {
                    for row in 0..size {
                        for col in (0..size).step_by(7) {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
                        }
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });

        group.bench_with_input(BenchmarkId::new("new", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || bit_vec::matrix::SparseBitMatrix::<BenchId, BenchId>::new(size),
                |mut matrix| {
                    for row in 0..size {
                        for col in (0..size).step_by(7) {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(col));
                        }
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });
    }

    group.finish();
}

fn sparse_union_rows(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/sparse/union_rows");

    for &size in &[64, 200, 1000] {
        group.bench_with_input(BenchmarkId::new("old", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || {
                    let mut matrix = bit_vec::SparseBitMatrix::<BenchId, BenchId>::new(size);
                    for col in (0..size).step_by(3) {
                        matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
                    }
                    for row in 1..size {
                        matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                    }
                    matrix
                },
                |mut matrix| {
                    for row in 1..size {
                        matrix.union_rows(BenchId::from_usize(0), BenchId::from_usize(row));
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });

        group.bench_with_input(BenchmarkId::new("new", size), &size, |bencher, &size| {
            bencher.iter_batched(
                || {
                    let mut matrix =
                        bit_vec::matrix::SparseBitMatrix::<BenchId, BenchId>::new(size);
                    for col in (0..size).step_by(3) {
                        matrix.insert(BenchId::from_usize(0), BenchId::from_usize(col));
                    }
                    for row in 1..size {
                        matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                    }
                    matrix
                },
                |mut matrix| {
                    for row in 1..size {
                        matrix.union_rows(BenchId::from_usize(0), BenchId::from_usize(row));
                    }
                    black_box(matrix);
                },
                BatchSize::SmallInput,
            );
        });
    }

    group.finish();
}

fn sparse_clear_reuse(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("bit_matrix/sparse/clear_reuse");

    for &size in &[64, 200, 1000] {
        group.bench_with_input(
            BenchmarkId::new("old_clear_reinsert", size),
            &size,
            |bencher, &size| {
                bencher.iter_batched(
                    || {
                        let mut matrix = bit_vec::SparseBitMatrix::<BenchId, BenchId>::new(size);
                        for row in 0..size {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                        }
                        matrix
                    },
                    |mut matrix| {
                        // Clear and reinsert — old impl allocates fresh DenseBitSets.
                        for row in 0..size {
                            matrix.clear(BenchId::from_usize(row));
                        }
                        for row in 0..size {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                        }
                        black_box(matrix);
                    },
                    BatchSize::SmallInput,
                );
            },
        );

        group.bench_with_input(
            BenchmarkId::new("new_clear_reinsert", size),
            &size,
            |bencher, &size| {
                bencher.iter_batched(
                    || {
                        let mut matrix =
                            bit_vec::matrix::SparseBitMatrix::<BenchId, BenchId>::new(size);
                        for row in 0..size {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                        }
                        matrix
                    },
                    |mut matrix| {
                        // Clear and reinsert — new impl reuses slots from free-list.
                        for row in 0..size {
                            matrix.clear_row(BenchId::from_usize(row));
                        }
                        for row in 0..size {
                            matrix.insert(BenchId::from_usize(row), BenchId::from_usize(0));
                        }
                        black_box(matrix);
                    },
                    BatchSize::SmallInput,
                );
            },
        );
    }

    group.finish();
}

criterion_group!(
    benches,
    dense_insert,
    dense_contains,
    dense_union_rows,
    dense_transitive_closure,
    dense_row_iter,
    sparse_insert,
    sparse_union_rows,
    sparse_clear_reuse,
);
criterion_main!(benches);
