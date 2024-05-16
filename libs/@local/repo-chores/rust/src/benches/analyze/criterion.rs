use std::fmt;

use crate::benches::{
    analyze::BenchmarkAnalysis,
    fmt::{latex::Latex, Braced, Color, Colored, Duration},
    report::Stat,
};

fn stat(fmt: &mut fmt::Formatter<'_>, stat: &Stat, change: Option<&Stat>) -> fmt::Result {
    Latex::fmt(&Duration::from_nanos(stat.point_estimate), fmt)?;
    fmt.write_str(" \\pm ")?;
    Latex::fmt(&Duration::from_nanos(stat.standard_error), fmt)?;
    if let Some(change) = change {
        let value = Duration::from_percent(change.point_estimate);
        let color = if value.amount < -5.0 {
            Color::Green
        } else if value.amount > 5.0 {
            Color::Red
        } else {
            Color::Gray
        };
        Latex::fmt(
            &Braced {
                value: Colored { value, color },
            },
            fmt,
        )?;
    }

    Ok(())
}

fn group_start(fmt: &mut fmt::Formatter<'_>, group_id: &str) -> fmt::Result {
    writeln!(fmt, "## {group_id}\n")
}

fn group_end(fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    fmt.write_str("\n\n")
}

fn table_header(fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
    fmt.write_str("| Function | Value | Mean |\n")?;
    fmt.write_str("|----------|-------|------|\n")
}

fn table_row(
    fmt: &mut fmt::Formatter<'_>,
    function: &str,
    value: &str,
    mean: &Stat,
    change: Option<&Stat>,
) -> fmt::Result {
    write!(fmt, "| {function} | {value} | $$")?;
    stat(fmt, mean, change)?;
    writeln!(fmt, " $$ |")
}

/// Formats the given benchmarks in GitHub-flavored Markdown.
///
/// # Errors
///
/// Returns an error if writing to `fmt` fails.
pub fn format_github_markdown<'b>(
    analyses: impl IntoIterator<Item = &'b BenchmarkAnalysis>,
    fmt: &mut fmt::Formatter<'_>,
) -> fmt::Result {
    let mut last_group_id = None::<&str>;
    for analysis in analyses {
        if last_group_id.is_none() {
            group_start(fmt, &analysis.measurement.info.group_id)?;
            table_header(fmt)?;
        } else if let Some(group_id) = last_group_id.as_ref() {
            if *group_id != analysis.measurement.info.group_id {
                group_end(fmt)?;
                group_start(fmt, &analysis.measurement.info.group_id)?;
                table_header(fmt)?;
            }
        }
        last_group_id = Some(analysis.measurement.info.group_id.as_str());
        table_row(
            fmt,
            analysis
                .measurement
                .info
                .function_id
                .as_deref()
                .unwrap_or_default(),
            analysis
                .measurement
                .info
                .value_str
                .as_deref()
                .unwrap_or_default(),
            &analysis.measurement.estimates.mean,
            analysis.change.as_ref().map(|x| &x.mean),
        )?;
    }

    Ok(())
}
