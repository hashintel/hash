use core::{
    error::Error,
    fmt::{Display, Formatter},
};
use std::{
    fs::File,
    io,
    io::{BufWriter, Write},
    path::{Path, PathBuf},
};

use bytes::Bytes;
use clap::Parser;
use error_stack::{Report, ResultExt as _};
use inferno::flamegraph;

use crate::{
    benches::{
        analyze::{AnalyzeError, BenchmarkAnalysis, criterion},
        report::Benchmark,
    },
    cli::subcommand::benches::{criterion_directory, current_commit, target_directory},
};

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

    let mut benchmarks = analyze_benchmarks(
        &criterion_directory(),
        &args.baseline,
        &artifacts_path,
        args.enforce_flame_graph,
    )?;

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

/// Analyzes every benchmark in `criterion_path` that has a `baseline` measurement and writes a
/// flame graph next to each benchmark's artifacts in `artifacts_path`.
fn analyze_benchmarks(
    criterion_path: &Path,
    baseline: &str,
    artifacts_path: &Path,
    enforce_flame_graph: bool,
) -> Result<Vec<BenchmarkAnalysis>, Report<AnalyzeError>> {
    Benchmark::gather(criterion_path, baseline)
        .map(|benchmark| {
            let analysis = BenchmarkAnalysis::from_benchmark(benchmark?, baseline, artifacts_path)
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
            } else if enforce_flame_graph {
                return Err(Report::new(AnalyzeError::FlameGraphMissing)
                    .attach(analysis.measurement.info.title));
            } else {
                // No folded stacks available and flame graph is not enforced, continue without it
            }
            Ok(analysis)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    use serde_json::json;

    use super::*;

    /// A fixture directory mirroring the CI layout after the base run's `new` measurements were
    /// cleared and the head run finished: `criterion/` holds criterion's output and `artifacts/`
    /// holds the folded stacks the head run produced.
    struct Fixture {
        root: PathBuf,
    }

    impl Fixture {
        fn new(name: &str) -> Self {
            let root = std::env::temp_dir()
                .join(format!("repo-chores-benches-{name}-{}", std::process::id()));
            let _: io::Result<()> = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join("criterion")).expect("should create fixture");
            fs::create_dir_all(root.join("artifacts")).expect("should create fixture");
            Self { root }
        }

        fn criterion(&self) -> PathBuf {
            self.root.join("criterion")
        }

        fn artifacts(&self) -> PathBuf {
            self.root.join("artifacts")
        }

        fn write_json(path: PathBuf, value: &serde_json::Value) {
            fs::create_dir_all(path.parent().expect("should have a parent directory"))
                .expect("should create fixture");
            fs::write(path, value.to_string()).expect("should write fixture");
        }

        /// Writes a criterion measurement named `measurement` for `group/function`.
        fn measurement(&self, group: &str, function: &str, measurement: &str) {
            let stat = json!({
                "confidence_interval": {
                    "confidence_level": 0.95,
                    "lower_bound": 1.0,
                    "upper_bound": 3.0,
                },
                "point_estimate": 2.0,
                "standard_error": 0.5,
            });
            let dir = self
                .criterion()
                .join(group)
                .join(function)
                .join(measurement);
            Self::write_json(
                dir.join("benchmark.json"),
                &json!({
                    "title": format!("{group}/{function}"),
                    "full_id": format!("{group}/{function}"),
                    "directory_name": format!("{group}/{function}"),
                    "throughput": null,
                    "group_id": group,
                    "function_id": function,
                    "value_str": null,
                }),
            );
            Self::write_json(
                dir.join("estimates.json"),
                &json!({
                    "mean": stat,
                    "median": stat,
                    "median_abs_dev": stat,
                    "slope": null,
                    "std_dev": stat,
                }),
            );
            Self::write_json(
                dir.join("sample.json"),
                &json!({ "sampling_mode": "Flat", "iters": [1.0], "times": [2.0] }),
            );
            Self::write_json(dir.join("tukey.json"), &json!([0.0, 1.0, 3.0, 4.0]));
        }

        /// Writes the comparison criterion produces when a `base` measurement already existed.
        fn change(&self, group: &str, function: &str) {
            let stat = json!({
                "confidence_interval": {
                    "confidence_level": 0.95,
                    "lower_bound": -0.1,
                    "upper_bound": 0.1,
                },
                "point_estimate": 0.0,
                "standard_error": 0.05,
            });
            Self::write_json(
                self.criterion()
                    .join(group)
                    .join(function)
                    .join("change/estimates.json"),
                &json!({ "mean": stat, "median": stat }),
            );
        }

        fn profile(&self, group: &str, function: &str) {
            let dir = self.artifacts().join(group).join(function);
            fs::create_dir_all(&dir).expect("should create fixture");
            // The first line is the benchmark setup and is skipped when rendering.
            fs::write(dir.join("tracing.folded"), "setup 1\nmain;work 10\n")
                .expect("should write fixture");
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _: io::Result<()> = fs::remove_dir_all(&self.root);
        }
    }

    fn analyze(fixture: &Fixture) -> Result<Vec<BenchmarkAnalysis>, Report<AnalyzeError>> {
        analyze_benchmarks(&fixture.criterion(), "new", &fixture.artifacts(), true)
    }

    #[test]
    fn reports_only_current_run_benchmarks() {
        let fixture = Fixture::new("current-run");
        // Removed on the head branch: only the base run's `base` copy remains, and its profile
        // was deleted with the base checkout.
        fixture.measurement("group", "removed", "base");
        // Present on both branches: compared against the base run.
        fixture.measurement("group", "shared", "base");
        fixture.measurement("group", "shared", "new");
        fixture.change("group", "shared");
        fixture.profile("group", "shared");
        // Added on the head branch: nothing to compare against. Criterion still copies the
        // measurement to `base` after the run.
        fixture.measurement("group", "added", "base");
        fixture.measurement("group", "added", "new");
        fixture.profile("group", "added");

        let mut analyses = analyze(&fixture).expect("should analyze head results");
        analyses.sort_by(|lhs, rhs| lhs.measurement.info.title.cmp(&rhs.measurement.info.title));

        let reported = analyses
            .iter()
            .map(|analysis| {
                (
                    analysis.measurement.info.title.as_str(),
                    analysis.change.is_some(),
                    analysis.path.join("flamegraph.svg").is_file(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(
            reported,
            [("group/added", false, true), ("group/shared", true, true)]
        );
    }

    #[test]
    fn missing_profile_fails() {
        let fixture = Fixture::new("missing-profile");
        fixture.measurement("group", "shared", "base");
        fixture.measurement("group", "shared", "new");
        fixture.change("group", "shared");
        fixture.profile("group", "shared");
        fixture.measurement("group", "unprofiled", "new");

        let report = analyze(&fixture).expect_err("should fail without a profile");
        assert!(matches!(
            report.current_context(),
            AnalyzeError::FlameGraphMissing
        ));
    }
}
