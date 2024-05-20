use std::{error::Error, path::PathBuf};

use aws_config::BehaviorVersion;
use clap::Parser;
use error_stack::{Report, ResultExt};
use repo_chores::benches::{
    analyze::BenchmarkAnalysis,
    report::Benchmark,
    storage::{S3Storage, UploadError},
};

use crate::subcommand::benches::{criterion_directory, target_directory};

fn current_commit() -> Result<String, Box<dyn Error + Send + Sync>> {
    Ok(String::from_utf8(
        std::process::Command::new("git")
            .args(["rev-parse", "HEAD"])
            .output()
            .attach_printable("Could not get current commit hash")?
            .stdout,
    )?
    .trim()
    .to_owned())
}

#[derive(Debug, Parser)]
#[clap(version, author, about, long_about = None)]
pub(crate) struct Args {
    /// The region to use for the AWS client
    #[clap(long)]
    commit: Option<String>,

    /// The path to the directory where the benchmark artifacts are stored.
    #[clap(long)]
    artifacts_path: Option<PathBuf>,

    /// Error if the benchmark did not generate a flamegraph.
    #[clap(long, default_value_t = false)]
    enforce_flame_graph: bool,
}

pub(super) async fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region("us-east-1")
        .load()
        .await;

    let benchmarks = Benchmark::gather(criterion_directory()).collect::<Result<Vec<_>, _>>()?;

    let artifacts_path = args.artifacts_path.unwrap_or_else(target_directory);

    let s3 = S3Storage::new(&config, "benchmarks.hash.dev");
    let commit = args.commit.map_or_else(current_commit, Ok)?;
    for benchmark in benchmarks {
        s3.put_benchmark_analysis(
            BenchmarkAnalysis::from_benchmark(benchmark, "new", &artifacts_path)
                .change_context(UploadError::ReadInput)
                .and_then(|analysis| {
                    if args.enforce_flame_graph && analysis.folded_stacks.is_none() {
                        Err(Report::new(UploadError::FlameGraphMissing)
                            .attach_printable(analysis.measurement.info.title))
                    } else {
                        Ok(analysis)
                    }
                })?,
            &commit,
        )
        .await?;
    }

    Ok(())
}
