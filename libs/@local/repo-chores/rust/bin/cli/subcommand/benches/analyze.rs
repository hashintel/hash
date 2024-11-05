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

use clap::Parser;
use error_stack::{Report, ResultExt as _};
use repo_chores::benches::{
    analyze::{AnalyzeError, BenchmarkAnalysis, criterion},
    report::Benchmark,
};

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

    let benchmarks = Benchmark::gather(criterion_directory())
        .map(|benchmark| {
            benchmark.and_then(|benchmark| {
                BenchmarkAnalysis::from_benchmark(benchmark, &args.baseline, &artifacts_path)
                    .change_context(AnalyzeError::ReadInput)
                    .and_then(|analysis| {
                        if args.enforce_flame_graph && analysis.folded_stacks.is_none() {
                            Err(Report::new(AnalyzeError::FlameGraphMissing)
                                .attach_printable(analysis.measurement.info.title))
                        } else {
                            Ok(analysis)
                        }
                    })
            })
        })
        .collect::<Result<Vec<_>, _>>()?;

    writeln!(output, "{}", BenchFormatter(&benchmarks, &commit))?;

    Ok(())
}
