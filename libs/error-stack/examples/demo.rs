#![allow(
    clippy::print_stdout,
    clippy::print_stderr,
    unreachable_pub,
    clippy::use_debug,
    clippy::alloc_instead_of_core,
    clippy::std_instead_of_alloc,
    clippy::std_instead_of_core
)]
// This is the same example also used in the README.md. When updating this, don't forget updating
// the README.md as well. This is mainly used to test the code and generate the output shown.

use std::fmt;

use error_stack::{Context, IntoReport, Report, Result, ResultExt};

#[derive(Debug)]
struct ParseExperimentError;

impl fmt::Display for ParseExperimentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("invalid experiment description")
    }
}

impl Context for ParseExperimentError {}

fn parse_experiment(description: &str) -> Result<Vec<(u64, u64)>, ParseExperimentError> {
    let values = description
        .split(' ')
        .map(|value| {
            value
                .parse::<u64>()
                .into_report()
                .attach_printable_lazy(|| format!("{value:?} could not be parsed as experiment"))
        })
        .map(|value| value.map(|ok| (ok, 2 * ok)))
        .fold(Ok(vec![]), |accum, value| match (accum, value) {
            (Ok(mut accum), Ok(value)) => {
                accum.push(value);

                Ok(accum)
            }
            (Ok(_), Err(err)) => Err(err),
            (Err(accum), Ok(_)) => Err(accum),
            (Err(mut accum), Err(err)) => {
                accum.extend_one(err);

                Err(accum)
            }
        })
        .change_context(ParseExperimentError)?;

    Ok(values)
}

#[derive(Debug)]
struct ExperimentError;

impl fmt::Display for ExperimentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("experiment error: could not run experiment")
    }
}

impl Context for ExperimentError {}

fn start_experiments(
    experiment_ids: &[usize],
    experiment_descriptions: &[&str],
) -> Result<Vec<u64>, ExperimentError> {
    let experiments = experiment_ids
        .iter()
        .map(|exp_id| {
            let description = experiment_descriptions.get(*exp_id).ok_or_else(|| {
                Report::new(ExperimentError)
                    .attach_printable(format!("experiment {exp_id} has no valid description"))
            })?;

            let experiments = parse_experiment(description)
                .attach_printable(format!("experiment {exp_id} could not be parsed"))
                .change_context(ExperimentError)?;

            let experiments = experiments
                .into_iter()
                .map(|(a, b)| move || a * b)
                .collect::<Vec<_>>();

            Ok(experiments)
        })
        .fold(
            Ok(vec![]),
            |accum: Result<_, ExperimentError>, value| match (accum, value) {
                (Ok(mut accum), Ok(value)) => {
                    accum.extend(value);

                    Ok(accum)
                }
                (Ok(_), Err(err)) => Err(err),
                (Err(accum), Ok(_)) => Err(accum),
                (Err(mut accum), Err(err)) => {
                    accum.extend_one(err);

                    Err(accum)
                }
            },
        )
        .attach_printable("unable to set up experiments")?;

    Ok(experiments.iter().map(|experiment| experiment()).collect())
}

fn main() -> Result<(), ExperimentError> {
    let experiment_ids = &[0, 2, 3];
    let experiment_descriptions = &["10", "20", "3o 4a"];
    start_experiments(experiment_ids, experiment_descriptions)?;

    Ok(())
}
