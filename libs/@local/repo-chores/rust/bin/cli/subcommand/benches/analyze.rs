use core::{
    error::Error,
    fmt::{Display, Formatter},
};
use std::{
    fs::File,
    io,
    io::{BufWriter, Write},
    path::PathBuf,
};

use bytes::Bytes;
use clap::Parser;
use error_stack::{Report, ResultExt as _};
use hash_repo_chores::benches::{
    analyze::{AnalyzeError, BenchmarkAnalysis, criterion},
    report::Benchmark,
};
use inferno::flamegraph;

use crate::subcommand::benches::{criterion_directory, current_commit, target_directory};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// Output file to write the benchmark results to.
    #[clap(short, long)]
    output: Option<PathBuf>,

    /// The current commit to identify the benchmark results.
    #[clap(long)]
    commit: Option<String>,

    /// Baseline to analyze.
    #[clap(long, default_value = "new")]
    baseline: String,

    /// The path to the directory where the benchmark artifacts are stored.
    #[clap(long)]
    artifacts_path: Option<PathBuf>,

    /// Error if the benchmark did not generate a flamegraph.
    #[clap(long, default_value_t = false)]
    enforce_flame_graph: bool,
}

pub(super) fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    struct BenchFormatter<'b>(&'b [BenchmarkAnalysis], &'b str);

    impl Display for BenchFormatter<'_> {
        fn fmt(&self, fmt: &mut Formatter<'_>) -> core::fmt::Result {
            criterion::format_github_markdown(fmt, self.0, self.1)
        }
    }

    let mut output = args
        .output
        .map(|path| {
            Ok::<_, io::Error>(Box::new(BufWriter::new(File::create(path)?)) as Box<dyn Write>)
        })
        .transpose()?
        .unwrap_or_else(|| Box::new(io::stdout()));

    let artifacts_path = args.artifacts_path.unwrap_or_else(target_directory);
    let commit = args.commit.map_or_else(current_commit, Ok)?;

    let mut benchmarks = Benchmark::gather(criterion_directory())
        .map(|benchmark| {
            let analysis =
                BenchmarkAnalysis::from_benchmark(benchmark?, &args.baseline, &artifacts_path)
                    .change_context(AnalyzeError::ReadInput)?;
            if let Some(folded_stacks) = &analysis.folded_stacks {
                let flamegraph = folded_stacks
                    .create_flame_graph(flamegraph::Options::default())
                    .change_context(AnalyzeError::FlameGraphCreation)?;
                BufWriter::new(
                    File::options()
                        .create(true)
                        .truncate(true)
                        .write(true)
                        .open(analysis.path.join("flamegraph.svg"))
                        .change_context(AnalyzeError::FlameGraphCreation)?,
                )
                .write_all(Bytes::from(flamegraph).as_ref())
                .change_context(AnalyzeError::FlameGraphCreation)?;
            } else if args.enforce_flame_graph {
                return Err(Report::new(AnalyzeError::FlameGraphMissing)
                    .attach_printable(analysis.measurement.info.title));
            } else {
                // No folded stacks available and flame graph is not enforced, continue without it
            }
            Ok(analysis)
        })
        .collect::<Result<Vec<_>, _>>()?;

    // Sort benchmarks for consistent ordering
    benchmarks.sort_by(|lhs, rhs| {
        lhs.measurement
            .info
            .group_id
            .cmp(&rhs.measurement.info.group_id)
            .then_with(|| {
                lhs.measurement
                    .info
                    .function_id
                    .cmp(&rhs.measurement.info.function_id)
            })
            .then_with(|| {
                lhs.measurement
                    .info
                    .value_str
                    .cmp(&rhs.measurement.info.value_str)
            })
    });

    writeln!(output, "{}", BenchFormatter(&benchmarks, &commit))?;

    Ok(())
}
