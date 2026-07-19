//! Clump-threshold calibration over a published k-NN table.
//!
//! Prints the near-duplicate grouping's shape at each candidate
//! epsilon, the evidence the quality suite's clump threshold default
//! is pinned on:
//!
//! ```text
//! cargo run -p hash-graph-atlas --features bench --release --example clump_sweep -- \
//!     <generation>/knn.sprs 0.05 0.10 0.15 0.20 0.25
//! ```
//!
//! The reference corpus structure from the 2026-07-12 audit at
//! 985,932 rows: 165K multi-row groups covering 66% of the corpus at
//! a mean group size near 4. A candidate threshold is judged by how
//! closely it reproduces that shape and by whether the flagged
//! subgroups it is expected to resolve actually restore.
#![expect(
    clippy::print_stdout,
    clippy::print_stderr,
    reason = "the harness reports its measurements on stdout and its usage on stderr"
)]

use std::process::ExitCode;

use hash_graph_atlas::bench::quality::sweep;

fn main() -> ExitCode {
    let mut arguments = std::env::args().skip(1);
    let Some(path) = arguments.next() else {
        eprintln!("usage: clump_sweep <knn.sprs> <epsilon>...");
        return ExitCode::FAILURE;
    };
    let epsilons: Vec<f32> = arguments
        .map(|argument| {
            argument
                .parse()
                .unwrap_or_else(|_| panic!("epsilon {argument} should be a float"))
        })
        .collect();
    if epsilons.is_empty() {
        eprintln!("usage: clump_sweep <knn.sprs> <epsilon>...");
        return ExitCode::FAILURE;
    }

    let sweep = match sweep(&path, &epsilons) {
        Ok(sweep) => sweep,
        Err(error) => {
            eprintln!("{path} does not hold a k-NN table: {error}");
            return ExitCode::FAILURE;
        }
    };

    println!(
        "rows {}  neighbours {}\n\n{:>9} {:>12} {:>12} {:>14} {:>10} {:>10}",
        sweep.rows,
        sweep.neighbours,
        "epsilon",
        "clumps",
        "groups",
        "grouped_rows",
        "coverage",
        "mean_size",
    );
    for reading in &sweep.readings {
        #[expect(
            clippy::cast_precision_loss,
            reason = "row counts stay far inside the f64 mantissa"
        )]
        let (coverage, mean_size) = (
            reading.grouped_rows as f64 / sweep.rows as f64,
            if reading.groups == 0 {
                0.0
            } else {
                reading.grouped_rows as f64 / reading.groups as f64
            },
        );
        println!(
            "{:>9.4} {:>12} {:>12} {:>14} {:>9.1}% {:>10.2}",
            reading.epsilon,
            reading.clumps,
            reading.groups,
            reading.grouped_rows,
            coverage * 100.0,
            mean_size,
        );
    }

    ExitCode::SUCCESS
}
