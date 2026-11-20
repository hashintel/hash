use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::Definition;
use time::OffsetDateTime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};

use super::{RunError, RunId, RunRecord, current, save};
use crate::Storage;

/// What a run is started with.
#[derive(Debug, Clone)]
pub struct StartInput {
    /// The id of the run, which the caller makes with [`RunId::new`] once per run.
    pub run: RunId,
    /// The web the run writes its entities to.
    pub web: WebId,
    /// The actor the run writes as.
    pub actor: ActorEntityUuid,
    /// The definition as written, in YAML, which is kept with the run.
    pub definition: Box<str>,
    /// The namespace entity ids are derived in, or `None` for the connector's id.
    pub id_namespace: Option<Box<str>>,
    /// When the run was asked for.
    pub submitted_at: OffsetDateTime,
}

/// Reports why a run could not be started.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum StartError {
    #[display("another run of the integration is active: {active}")]
    RunActive { active: RunId },
    #[display("`current.json` changed since it was read")]
    Changed,
    #[display("`current.json` is not valid, and has to be fixed by hand")]
    Unreadable,
    #[display("the state of the integration could not be read or written")]
    Storage,
}

/// Starts the run `input.run` of the integration that `storage` belongs to.
///
/// Writes the run's `run.json` and names the run as active in `current.json`. A run starts only
/// when no other run of the integration is active. `definition` is `input.definition`, parsed.
///
/// Starting the active run or the last completed run again does nothing, so a caller whose start
/// failed starts the same run again.
///
/// # Errors
///
/// - [`StartError::RunActive`] if another run of the integration is active. Nothing is written.
/// - [`StartError::Changed`] if `current.json` changed since it was read. Starting the same run
///   again can succeed.
/// - [`StartError::Unreadable`] if `current.json` is not valid. Starting again cannot help.
/// - [`StartError::Storage`] if the bucket cannot be read or written. Starting the same run again
///   can succeed.
pub async fn start(
    storage: &Storage,
    definition: &Definition,
    input: StartInput,
) -> Result<(), Report<StartError>> {
    let run = input.run;
    let (current, version) = current::read(storage).await.map_err(|report| {
        let context = if *report.current_context() == RunError::Unreadable {
            StartError::Unreadable
        } else {
            StartError::Storage
        };
        report.change_context(context)
    })?;
    // An earlier start of this run got through, even if its caller saw an error: a write can
    // land although its answer was lost. Starting it again changes nothing.
    if current.active == Some(run) || current.last_completed == Some(run) {
        return Ok(());
    }
    // One run per integration at a time. The active run has to complete first.
    if let Some(active) = current.active {
        return Err(Report::new(StartError::RunActive { active }));
    }

    // `run.json` is written before the run becomes active, so that every stage of an active run
    // finds its record.
    match save(storage, &RunRecord::new(definition, input), None).await {
        Ok(()) => {}
        // An earlier start of this run created `run.json` and stopped before it activated the
        // run. The file is kept, and this start goes on to activate the run.
        Err(report) if *report.current_context() == RunError::Changed => {}
        Err(report) => return Err(report.change_context(StartError::Storage)),
    }
    // The run becomes active only if `current.json` is unchanged since it was read above. If
    // another start wrote it in between, at most one of them wins, and this one is refused.
    // Its `run.json` stays behind, and a later start of the same run uses it.
    if current::activate(storage, current, version.as_ref(), run)
        .await
        .change_context(StartError::Storage)?
    {
        Ok(())
    } else {
        Err(Report::new(StartError::Changed))
    }
}
