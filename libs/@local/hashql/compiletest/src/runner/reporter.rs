use core::fmt::Write as _;
use std::{
    io::{self, Write as _, stderr},
    process::ExitCode,
};

use error_stack::Report;

use super::ui::common::styles::{BLUE, CYAN, DIM, MAGENTA, RED};
use crate::harness::trial::{TrialDescription, TrialError};

pub(crate) fn report_errors(
    reports: Vec<Report<[TrialError]>>,
    total_trials: usize,
) -> io::Result<ExitCode> {
    if reports.is_empty() {
        return Ok(ExitCode::SUCCESS);
    }

    let mut stderr = stderr();
    let failed = reports.len();

    let header = format!(" {RED}FAILURES{RED:#} ({failed} of {total_trials}) ");
    writeln!(stderr, "\n{header:━^80}\n")?;

    for (index, report) in reports.into_iter().enumerate() {
        let number = index + 1;

        let mut title = format!("[{number}/{failed}] ");

        if let Some(description) = report.request_ref::<TrialDescription>().next() {
            let TrialDescription {
                package,
                namespace,
                name,
            } = description;

            let _ = write!(
                title,
                "{MAGENTA}{package}{MAGENTA:#} {CYAN}{}{CYAN:#}::{BLUE}{name}{BLUE:#}",
                namespace.join("::")
            );
        } else {
            let _ = write!(title, "{RED}unknown{RED:#}");
        }

        writeln!(stderr, "{title}")?;
        writeln!(stderr, "{DIM}{:─^80}{DIM:#}", "")?;

        #[expect(clippy::use_debug)]
        writeln!(stderr, "{report:?}")?;

        if index < failed - 1 {
            writeln!(stderr)?;
        }
    }

    stderr.flush()?;
    Ok(ExitCode::FAILURE)
}
