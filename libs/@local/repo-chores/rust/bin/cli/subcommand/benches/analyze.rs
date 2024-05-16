use std::{
    error::Error,
    fmt::{Display, Formatter},
    fs::File,
    io,
    io::{BufWriter, Write},
    path::PathBuf,
};

use clap::Parser;
use error_stack::{Report, ResultExt};
use repo_chores::benches::{
    analyze::{criterion, AnalyzeError, BenchmarkAnalysis},
    report::Benchmark,
};

use crate::subcommand::benches::{criterion_directory, target_directory};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// Output file to write the benchmark results to.
    #[clap(short, long)]
    output: Option<PathBuf>,

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
    struct BenchFormatter<'b>(&'b [BenchmarkAnalysis]);

    impl Display for BenchFormatter<'_> {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            criterion::format_github_markdown(self.0, f)
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

    writeln!(output, "{}", BenchFormatter(&benchmarks))?;

    Ok(())
}
