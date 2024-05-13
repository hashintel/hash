use std::fmt;

use crate::benches::results::{Benchmark, Stat};

#[derive(Debug, Copy, Clone)]
enum Unit {
    Nanoseconds,
    Percent,
}

#[derive(Debug, Copy, Clone)]
struct Duration {
    amount: f64,
    unit: Unit,
}

impl fmt::Display for Duration {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        #[expect(clippy::float_arithmetic)]
        match self.unit {
            Unit::Nanoseconds => {
                let (number, unit) = if self.amount < 1.0 {
                    (self.amount * 1_000.0, "\\mathrm{ps}")
                } else if self.amount < 1_000.0 {
                    (self.amount, "\\mathrm{ns}")
                } else if self.amount < 1_000_000.0 {
                    (self.amount / 1_000.0, "\\mathrm{\u{3bc}s}")
                } else if self.amount < 1_000_000_000.0 {
                    (self.amount / 1_000_000.0, "\\mathrm{ms}")
                } else {
                    (self.amount / 1_000_000_000.0, "\\mathrm{s}")
                };

                if number < 1.0 {
                    write!(fmt, "{number:.3} {unit}")
                } else if number < 10.0 {
                    write!(fmt, "{number:.2} {unit}")
                } else if number < 100.0 {
                    write!(fmt, "{number:.1} {unit}")
                } else {
                    write!(fmt, "{number:.0} {unit}")
                }
            }
            Unit::Percent => write!(fmt, "{:+.2} \\mathrm{{\\\\%}}", self.amount * 100.0),
        }
    }
}

fn stat(fmt: &mut fmt::Formatter<'_>, stat: &Stat, change: Option<&Stat>) -> fmt::Result {
    write!(
        fmt,
        "{} \\pm {}",
        Duration {
            amount: stat.point_estimate,
            unit: Unit::Nanoseconds
        },
        Duration {
            amount: stat.standard_error,
            unit: Unit::Nanoseconds
        }
    )?;
    if let Some(change) = change {
        write!(
            fmt,
            " \\left({}\\right)",
            Duration {
                amount: change.point_estimate,
                unit: Unit::Percent
            }
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
    p_value: f64,
) -> fmt::Result {
    write!(fmt, "| {function} | {value} | $$")?;
    stat(fmt, mean, change)?;
    writeln!(fmt, " {p_value} $$ |")
}

/// Formats the given benchmarks in GitHub-flavored Markdown.
///
/// # Errors
///
/// Returns an error if writing to `fmt` fails.
pub fn format_github_markdown<'b>(
    benchmarks: impl IntoIterator<Item = &'b Benchmark>,
    fmt: &mut fmt::Formatter<'_>,
    baseline_name: &str,
) -> fmt::Result {
    let mut last_group_id = None::<&str>;
    for benchmark in benchmarks {
        for (name, baseline) in &benchmark.measurements {
            if **name != *baseline_name {
                continue;
            }

            if last_group_id.is_none() {
                group_start(fmt, &baseline.info.group_id)?;
                table_header(fmt)?;
            } else if let Some(group_id) = last_group_id.as_ref() {
                if *group_id != baseline.info.group_id {
                    group_end(fmt)?;
                    group_start(fmt, &baseline.info.group_id)?;
                    table_header(fmt)?;
                }
            }
            last_group_id = Some(baseline.info.group_id.as_str());
            table_row(
                fmt,
                baseline.info.function_id.as_deref().unwrap_or_default(),
                baseline.info.value_str.as_deref().unwrap_or_default(),
                &baseline.estimates.mean,
                benchmark.change.as_ref().map(|x| &x.mean),
                0.0,
            )?;
        }
    }

    Ok(())
}
