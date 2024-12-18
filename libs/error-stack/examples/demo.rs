// This is the same example also used in the README.md. When updating this, don't forget updating
// the README.md as well. This is mainly used to test the code and generate the output shown.

use core::{error::Error, fmt};

use error_stack::{Report, ResultExt as _};

#[derive(Debug)]
struct ParseExperimentError;

impl fmt::Display for ParseExperimentError {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("invalid experiment description")
    }
}

impl Error for ParseExperimentError {}

#[expect(
    clippy::manual_try_fold,
    reason = "false-positive, try_fold is fail-fast, our implementation is fail-slow"
)]
fn parse_experiment(description: &str) -> Result<Vec<(u64, u64)>, Report<ParseExperimentError>> {
    let values = description
        .split(' ')
        .map(|value| {
            value
                .parse::<u64>()
                .attach_printable_lazy(|| format!("{value:?} could not be parsed as experiment"))
        })
        .map(|value| value.map(|ok| (ok, 2 * ok)))
        .fold(Ok(vec![]), |accum, value| match (accum, value) {
            (Ok(mut accum), Ok(value)) => {
                accum.push(value);

                Ok(accum)
            }
            (Ok(_), Err(err)) => Err(err.expand()),
            (Err(accum), Ok(_)) => Err(accum),
            (Err(mut accum), Err(err)) => {
                accum.push(err);

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

impl Error for ExperimentError {}

#[expect(
    clippy::manual_try_fold,
    reason = "false-positive, try_fold is fail-fast, our implementation is fail-slow"
)]
fn start_experiments(
    experiment_ids: &[usize],
    experiment_descriptions: &[&str],
) -> Result<Vec<u64>, Report<[ExperimentError]>> {
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
                .map(|(lhs, rhs)| move || lhs * rhs)
                .collect::<Vec<_>>();

            Ok(experiments)
        })
        .fold(
            Ok(vec![]),
            |accum, value: Result<_, Report<ExperimentError>>| match (accum, value) {
                (Ok(mut accum), Ok(value)) => {
                    accum.extend(value);

                    Ok(accum)
                }
                (Ok(_), Err(err)) => Err(err.expand()),
                (Err(accum), Ok(_)) => Err(accum),
                (Err(mut accum), Err(err)) => {
                    accum.push(err);

                    Err(accum)
                }
            },
        )
        .attach_printable("unable to set up experiments")?;

    Ok(experiments.iter().map(|experiment| experiment()).collect())
}

fn main() -> Result<(), Report<[ExperimentError]>> {
    let experiment_ids = &[0, 2, 3];
    let experiment_descriptions = &["10", "20", "3o 4a"];
    start_experiments(experiment_ids, experiment_descriptions)?;

    Ok(())
}
