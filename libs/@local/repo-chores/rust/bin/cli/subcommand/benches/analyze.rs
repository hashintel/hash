use std::{
    fmt::{Display, Formatter},
    fs::File,
    io,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use clap::Parser;
use error_stack::{Report, ResultExt};
use repo_chores::benches::{
    analyze::{criterion, AnalyzeError},
    report::Benchmark,
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

    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .and_then(Path::parent)
        .and_then(Path::parent)
        .expect("could not find repository root directory")
        .join("target")
        .join("criterion");
    let canonicalized = path
        .canonicalize()
        .attach_printable_lazy(|| format!("Could not open directory `{}`", path.display()))
        .change_context(AnalyzeError::ReadInput)?;

    writeln!(
        output,
        "{}",
        BenchFormatter(Benchmark::gather(canonicalized).collect::<Result<_, _>>()?)
    )
    .change_context(AnalyzeError::WriteOutput)?;

    Ok(())
}
