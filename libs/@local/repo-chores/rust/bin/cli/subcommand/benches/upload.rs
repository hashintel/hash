use std::error::Error;

use aws_config::BehaviorVersion;
use clap::Parser;
use error_stack::ResultExt;
use repo_chores::benches::{report::Benchmark, storage::S3Storage};

use crate::subcommand::benches::criterion_directory;

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
}

pub(super) async fn run(args: Args) -> Result<(), Box<dyn Error + Send + Sync>> {
    let config = aws_config::defaults(BehaviorVersion::latest()).load().await;

    let benchmarks = Benchmark::gather(criterion_directory()?).collect::<Result<Vec<_>, _>>()?;

    let s3 = S3Storage::new(&config, "benchmarks.hash.dev");
    let commit = args.commit.map_or_else(current_commit, Ok)?;
    for measurement in benchmarks
        .iter()
        .filter_map(|report| report.measurements.get("new"))
    {
        s3.put_measurement(measurement, &commit).await?;
    }

    Ok(())
}
