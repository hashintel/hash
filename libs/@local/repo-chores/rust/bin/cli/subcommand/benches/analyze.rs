use std::{
    fmt::{Display, Formatter},
    fs::File,
    io,
    io::{BufWriter, Write},
    path::PathBuf,
};

use clap::Parser;
use error_stack::{Report, ResultExt};
use repo_chores::benches::{
    analyze::{criterion, AnalyzeError},
    results::Benchmark,
};

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// Output file to write the benchmark results to.
    #[clap(short, long)]
    output: Option<PathBuf>,
}

pub(super) fn run(args: Args) -> Result<(), Report<AnalyzeError>> {
    struct BenchFormatter(Vec<Benchmark>);

    impl Display for BenchFormatter {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            criterion::format_github_markdown(&self.0, f, "new")
        }
    }

    let mut output = args
        .output
        .map(|path| {
            Ok::<_, io::Error>(Box::new(BufWriter::new(File::create(path)?)) as Box<dyn Write>)
        })
        .transpose()
        .change_context(AnalyzeError::WriteOutput)?
        .unwrap_or_else(|| Box::new(std::io::stdout()));

    writeln!(
        output,
        "{}",
        BenchFormatter(
            Benchmark::gather("../../../../target/criterion").collect::<Result<_, _>>()?
        )
    )
    .change_context(AnalyzeError::WriteOutput)?;

    Ok(())
}
