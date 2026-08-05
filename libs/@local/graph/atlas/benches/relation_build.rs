//! Wall-time benchmarks for the relation-index build under skew.
//!
//! The build's parallel design makes claims that only hold or fail at realistic scale and volume
//! concentration; each group here measures one of them, over corpora synthesized at the live
//! store's measured shape (2.2M links, 17 relation types, the base type owning half of all
//! instances, Zipf-hubbed targets):
//!
//! - `build`: full-build wall time across the live, uniform, and single-mega-relation profiles. The
//!   profiles share endpoints, volume, and policies, so a spread between them is the cost of skew
//!   alone - the two-level parallelism claim is that the spread stays small.
//! - `stages` times the two whole-slice sorts, the group emission, the protection assembly, and the
//!   index re-validation in isolation, each from its own pre-sorted input state - the split that
//!   attributes the build's wall time and shows what caps its thread scaling.
//! - `threads` times the full build across pool sizes, on the live profile.
//! - `chunk` times group emission across chunk sizes around the production emission chunk. The
//!   claim that the constant is only a work-splitting unit predicts a flat response.
//!
//! Timings run at 1/8 of live scale by default so a full sweep stays in minutes. Set
//! `RELATION_BENCH_LINKS` (e.g. to `2200000`) for live-scale headline numbers. Wall time on rayon
//! passes depends on the host's core count and topology. Compare numbers within one machine, not
//! across.
//!
//! Before the timed groups, one report prints the pruned-edge and omitted-mass outcomes of a
//! pruning-threshold sweep on the live profile. A threshold is admissible while the omitted mass
//! fraction stays numerically negligible, and these are the numbers that judgement reads. The
//! fixture's masses come from its policy spread (the live store leaves confidence unscored), so the
//! sweep calibrates thresholds against policy mass, not against a confidence distribution.
#![expect(
    clippy::print_stderr,
    clippy::significant_drop_tightening,
    reason = "the pruning sweep is a calibration report beside the timings, and Criterion owns \
              group drops"
)]

use core::{hint::black_box, time::Duration};

use codspeed_criterion_compat::{
    BatchSize, Criterion, Throughput, criterion_group, criterion_main,
};
use hash_graph_atlas::bench::relation::{Profile, production_chunk, production_corpus};
use rayon::ThreadPoolBuilder;

/// One eighth of the measured live link volume.
const DEFAULT_LINKS: usize = 275_000;

const SEED: u64 = 0x5A17_A71A;

fn links() -> usize {
    std::env::var("RELATION_BENCH_LINKS").map_or(DEFAULT_LINKS, |value| {
        value
            .parse()
            .expect("RELATION_BENCH_LINKS should be a link count")
    })
}

/// Full-build wall time across volume-concentration profiles.
fn bench_build_profiles(criterion: &mut Criterion) {
    let mut group = criterion.benchmark_group("relation_build/build");
    group.sample_size(10);

    for profile in [Profile::Live, Profile::Uniform, Profile::Mega] {
        let corpus = production_corpus(profile, links(), SEED);
        group.throughput(Throughput::Elements(corpus.instance_count() as u64));
        group.bench_function(profile.label(), |bencher| {
            bencher.iter_batched_ref(
                || corpus.scratch(),
                |scratch| black_box(corpus.build_in(scratch, 0.0, 0.0)),
                BatchSize::LargeInput,
            );
        });
    }

    group.finish();
}

/// The build's stages in isolation, each from its own input state.
fn bench_stages(criterion: &mut Criterion) {
    let corpus = production_corpus(Profile::Live, links(), SEED);
    let chunk = production_chunk();

    let mut group = criterion.benchmark_group("relation_build/stages");
    group.sample_size(10);
    group.throughput(Throughput::Elements(corpus.instance_count() as u64));

    group.bench_function("sort_by_group", |bencher| {
        bencher.iter_batched_ref(
            || corpus.scratch(),
            |scratch| black_box(scratch.sort_by_group()),
            BatchSize::LargeInput,
        );
    });
    // The emission runner reads the corpus's cached group-sorted copy, so
    // its iterations carry no per-round clone; the assembly reorders its
    // record input, so each round takes a fresh clone outside the timing.
    group.bench_function("emit_groups", |bencher| {
        bencher.iter(|| corpus.emit_groups(black_box(chunk)));
    });
    group.bench_function("assemble_protection", |bencher| {
        bencher.iter_batched_ref(
            || corpus.records_scratch(),
            |records| corpus.assemble_protection(records),
            BatchSize::LargeInput,
        );
    });
    // Assembly constructs the invariants and then re-validates them;
    // this entry splits the stage's cost between scatter and check.
    group.bench_function("validate_protection", |bencher| {
        bencher.iter(|| corpus.validate_protection());
    });

    group.finish();
}

/// Full-build scaling across worker-pool sizes.
fn bench_thread_scaling(criterion: &mut Criterion) {
    let corpus = production_corpus(Profile::Live, links(), SEED);

    let mut group = criterion.benchmark_group("relation_build/threads");
    group.sample_size(10);
    group.throughput(Throughput::Elements(corpus.instance_count() as u64));

    let available = rayon::current_num_threads();
    for threads in [1, 2, 4, 8, 16] {
        if threads > available {
            break;
        }
        let pool = ThreadPoolBuilder::new()
            .num_threads(threads)
            .build()
            .expect("the bench pool should build");
        group.bench_function(format!("{threads}"), |bencher| {
            bencher.iter_batched_ref(
                || corpus.scratch(),
                |scratch| pool.install(|| black_box(corpus.build_in(scratch, 0.0, 0.0))),
                BatchSize::LargeInput,
            );
        });
    }

    group.finish();
}

/// Emission response to the chunk size, on the mega profile.
///
/// The mega profile gives group-level parallelism nothing to hide behind, so the emission pass
/// rides on chunking alone - the sharpest view of the flat-response claim.
fn bench_chunk_sensitivity(criterion: &mut Criterion) {
    let corpus = production_corpus(Profile::Mega, links(), SEED);
    let production = production_chunk();

    let mut group = criterion.benchmark_group("relation_build/chunk");
    group.sample_size(10);
    group.throughput(Throughput::Elements(corpus.instance_count() as u64));

    for shift in [-2_i32, -1, 0, 1, 2] {
        let chunk = if shift < 0 {
            production >> shift.unsigned_abs()
        } else {
            production << shift.unsigned_abs()
        };
        group.bench_function(format!("{chunk}"), |bencher| {
            bencher.iter(|| corpus.emit_groups(black_box(chunk)));
        });
    }

    group.finish();
}

/// Prints the pruning-threshold sweep the timings do not capture.
fn report_pruning_sweep() {
    let corpus = production_corpus(Profile::Live, links(), SEED);
    eprintln!(
        "pruning sweep: live profile, {} instances over {} rows",
        corpus.instance_count(),
        corpus.rows(),
    );
    for threshold in [0.0, 1e-3, 1e-2, 0.05, 0.125, 0.25, 0.5] {
        let mut scratch = corpus.scratch();
        let summary = corpus.build_in(&mut scratch, 0.0, threshold);
        eprintln!(
            "  eta_F {threshold:>7}: retained {:>8}, pruned {:>8}, omitted mass {:.6}",
            summary.retained_edges, summary.pruned_edges, summary.omitted_mass_fraction,
        );
    }
}

fn config() -> Criterion {
    Criterion::default()
        .warm_up_time(Duration::from_millis(500))
        .measurement_time(Duration::from_secs(10))
}

fn benches_with_report(criterion: &mut Criterion) {
    report_pruning_sweep();
    bench_build_profiles(criterion);
    bench_stages(criterion);
    bench_thread_scaling(criterion);
    bench_chunk_sensitivity(criterion);
}

criterion_group!(
    name = benches;
    config = config();
    targets = benches_with_report
);
criterion_main!(benches);
