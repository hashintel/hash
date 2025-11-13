use core::mem;
use std::{
    env, io,
    path::{Path, PathBuf},
};

use error_stack::{Report, ReportSink, ResultExt as _};

// Find the root of a git repository
fn find_git_root(mut path: &Path) -> io::Result<&Path> {
    loop {
        let git_dir = path.join(".git");
        if git_dir.exists() {
            return Ok(path);
        }

        let Some(parent) = path.parent() else {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "No .git directory found",
            ));
        };

        path = parent;
    }
}

fn strip_prefix(report: &mut lcov::Report, prefix: &Path) {
    let sections = mem::take(&mut report.sections);

    report.sections = sections
        .into_iter()
        .map(|(mut key, value)| {
            key.source_file = key
                .source_file
                .strip_prefix(prefix)
                .map(ToOwned::to_owned)
                .unwrap_or(key.source_file);

            (key, value)
        })
        .collect();
}

#[derive(Debug, Copy, Clone, derive_more::Display)]
pub(crate) enum MergeReportsError {
    #[display("unable to merge reports")]
    Merge,
    #[display("unable to parse report")]
    Parse,
    #[display("I/O error")]
    Io,
}

impl core::error::Error for MergeReportsError {}

fn load_reports(paths: Vec<PathBuf>) -> Result<lcov::Report, Report<[MergeReportsError]>> {
    let cwd = env::current_dir().change_context(MergeReportsError::Io)?;
    let root = find_git_root(&cwd).change_context(MergeReportsError::Io)?;

    let mut report = lcov::Report::new();
    let mut sink: ReportSink<MergeReportsError> = ReportSink::new();

    for path in paths {
        let Some(loaded) =
            sink.attempt(lcov::Report::from_file(&path).change_context(MergeReportsError::Parse))
        else {
            continue;
        };

        sink.attempt(
            report
                .merge(loaded)
                .change_context(MergeReportsError::Merge),
        );
    }

    sink.finish()?;

    strip_prefix(&mut report, root);

    Ok(report)
}

pub(crate) fn transform(
    paths: Vec<PathBuf>,
    mut output: impl io::Write,
) -> Result<(), Report<[MergeReportsError]>> {
    let report = load_reports(paths)?;

    for record in report.into_records() {
        writeln!(output, "{record}").change_context(MergeReportsError::Io)?;
    }

    Ok(())
}
