//! Peak-memory probe for the worst-permitted-case clustering request
//! (`n ~ 18k` entities, `k = 64`, `d = 512`, the committed API caps).
//!
//! Run under a max-RSS reporter, once per mode, and compare:
//!
//! ```sh
//! cargo build --release -p hash-graph-embeddings --example memory_footprint
//! /usr/bin/time -l target/release/examples/memory_footprint alloc    2>&1 | grep 'maximum resident'
//! /usr/bin/time -l target/release/examples/memory_footprint cluster  2>&1 | grep 'maximum resident'
//! ```
//!
//! `alloc` builds only the input matrix and exits; `cluster` additionally
//! runs the fit. The difference between the two max-RSS numbers is the
//! transient overhead of the fit itself (sample copy, restart scratch,
//! labels, centroids). The rayon pool is pinned to one thread to mirror the
//! production topology and to keep thread stacks out of the measurement.
#![expect(
    clippy::print_stdout,
    clippy::float_arithmetic,
    clippy::integer_division_remainder_used,
    clippy::min_ident_chars,
    clippy::cast_precision_loss,
    reason = "throwaway measurement probe; single-char idents (n, k, d) are standard notation"
)]

use hash_graph_embeddings::{D512, clustering};
use rand::{RngExt as _, SeedableRng as _};
use rand_xoshiro::Xoshiro256PlusPlus;

const K: u16 = 64;
const D: usize = 512;
/// ~the maximum entity count that fits through axum's 2 MiB body limit.
const N: usize = 18_000;

/// Blob-structured points so the fit converges like real embeddings.
fn blobs(n: usize, k: usize, d: usize, seed: u64) -> Vec<f32> {
    let mut rng = Xoshiro256PlusPlus::seed_from_u64(seed);
    let mut data = Vec::with_capacity(n * d);
    for point in 0..n {
        let dominant = point % k;
        for axis in 0..d {
            let base = if axis % k == dominant { 4.0 } else { 0.0 };
            data.push(base + rng.random_range(-1.0_f32..1.0));
        }
    }
    data
}

fn main() {
    let mode = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "cluster".to_owned());

    rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build_global()
        .expect("pool should initialize once");

    let data = blobs(N, usize::from(K), D, 42);
    println!(
        "input matrix: {} points x {D} dims = {:.1} MiB",
        N,
        (data.len() * size_of::<f32>()) as f64 / (1024.0 * 1024.0)
    );

    if mode == "cluster" {
        let config = clustering::Config::for_k_with_seed(K, 42);
        let result = clustering::cluster(&data, D512, &config);
        println!(
            "fit done, inertia: {}",
            core::hint::black_box(result.inertia)
        );
    }

    drop(core::hint::black_box(data));
}
