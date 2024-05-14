use std::{
    error::Error,
    fmt::{Display, Formatter},
    fs::File,
    io,
    io::{BufWriter, Write},
    path::PathBuf,
};

use clap::Parser;
use error_stack::ResultExt;
use repo_chores::benches::{
    analyze::{criterion, AnalyzeError},
    report::Benchmark,
};

use crate::subcommand::benches::criterion_directory;

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// Output file to write the benchmark results to.
    #[clap(short, long)]
    output: Option<PathBuf>,

    /// Baseline to analyze.
    #[clap(long, default_value = "new")]
    baseline: String,
}

pub(super) fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    struct BenchFormatter<'b>(Vec<Benchmark>, &'b str);

    impl Display for BenchFormatter<'_> {
        fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
            criterion::format_github_markdown(&self.0, f, self.1)
        }
    }

    let mut output = args
        .output
        .map(|path| {
            Ok::<_, io::Error>(Box::new(BufWriter::new(File::create(path)?)) as Box<dyn Write>)
        })
        .transpose()?
        .unwrap_or_else(|| Box::new(io::stdout()));

    writeln!(
        output,
        "{}",
        BenchFormatter(
            Benchmark::gather(criterion_directory().change_context(AnalyzeError::ReadInput)?)
                .collect::<Result<_, _>>()?,
            &args.baseline
        )
    )?;

    Ok(())
}
