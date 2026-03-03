use core::fmt;

use crate::benches::{
    analyze::BenchmarkAnalysis,
    fmt::{Braced, Color, Colored, Duration, latex::Latex},
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
    fmt.write_str("| Function | Value | Mean | Flame graphs | \n")?;
    fmt.write_str("|----------|-------|------|--------------|\n")
}

fn table_row(
    fmt: &mut fmt::Formatter<'_>,
    analysis: &BenchmarkAnalysis,
    name: &str,
) -> fmt::Result {
    write!(
        fmt,
        "| {} | {} | $$",
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
            .unwrap_or_default()
    )?;
    stat(
        fmt,
        &analysis.measurement.estimates.mean,
        analysis.change.as_ref().map(|estimate| &estimate.mean),
    )?;
    write!(fmt, " $$ |")?;
    if analysis.folded_stacks.is_some() {
        writeln!(
            fmt,
            " [Flame Graph](https://benchmarks.hash.dev/{}/{}/flamegraph.svg) |",
            name,
            analysis.measurement.info.directory_name.replace(' ', "+")
        )
    } else {
        fmt.write_str(" |\n")
    }
}

/// Formats the given benchmarks in GitHub-flavored Markdown.
///
/// # Errors
///
/// Returns an error if writing to `fmt` fails.
pub(crate) fn format_github_markdown<'b>(
    fmt: &mut fmt::Formatter<'_>,
    analyses: impl IntoIterator<Item = &'b BenchmarkAnalysis>,
    name: &str,
) -> fmt::Result {
    let mut last_group_id = None::<&str>;
    for analysis in analyses {
        if last_group_id.is_none() {
            group_start(fmt, &analysis.measurement.info.group_id)?;
            table_header(fmt)?;
        } else if let Some(group_id) = last_group_id.as_ref()
            && *group_id != analysis.measurement.info.group_id
        {
            group_end(fmt)?;
            group_start(fmt, &analysis.measurement.info.group_id)?;
            table_header(fmt)?;
        } else {
            // Group hasn't changed, continue with the current group
        }
        last_group_id = Some(analysis.measurement.info.group_id.as_str());
        table_row(fmt, analysis, name)?;
    }

    Ok(())
}
