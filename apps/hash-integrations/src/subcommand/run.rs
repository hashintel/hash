use std::{fs, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_orchestration::{RunId, RunPhase, Runs};
use serde::Serialize;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use crate::service::{IntegrationService, Invocation, Request, Submission};

/// Why a subcommand failed.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum SubcommandError {
    #[display("no orchestration backend is available")]
    NoBackend,
    #[display("the integration definition could not be read")]
    ReadDefinition,
    #[display("the integration service rejected the request")]
    Service,
    #[display("no run has this ID")]
    UnknownRun,
}

/// Who asks, for which web.
#[derive(Debug, clap::Args)]
pub struct RequestArgs {
    /// The web the request is for.
    #[clap(long, env = "HASH_WEB_ID")]
    pub web: Uuid,

    /// The actor who makes the request.
    #[clap(long, env = "HASH_ACTOR_ID")]
    pub actor: Uuid,
}

impl RequestArgs {
    fn request(&self, id: Uuid) -> Request {
        Request {
            web: WebId::new(self.web),
            actor: ActorEntityUuid::new(self.actor),
            id,
        }
    }

    fn service<R: Runs>(&self, runs: R) -> IntegrationService<R> {
        IntegrationService::new(runs, WebId::new(self.web))
    }
}

#[derive(Debug, clap::Parser)]
pub struct SubmitArgs {
    #[clap(flatten)]
    pub request: RequestArgs,

    /// The path of the integration definition.
    pub definition: PathBuf,

    /// Load only the links of the integration.
    #[clap(long)]
    pub links_only: bool,

    /// The ID of the request. Repeating a request with the same ID attaches to the run it started.
    #[clap(long)]
    pub request_id: Option<Uuid>,
}

#[derive(Debug, clap::Parser)]
pub struct RunArgs {
    #[clap(flatten)]
    pub request: RequestArgs,

    /// The ID of the run.
    pub run: RunId,
}

/// Starts the run of the definition and prints its ID.
pub(crate) async fn submit<R: Runs>(
    runs: R,
    args: SubmitArgs,
) -> Result<(), Report<SubcommandError>> {
    let definition = fs::read_to_string(&args.definition)
        .change_context(SubcommandError::ReadDefinition)
        .attach_with(|| args.definition.display().to_string())?;
    let request = args
        .request
        .request(args.request_id.unwrap_or_else(Uuid::new_v4));

    let run = args
        .request
        .service(runs)
        .submit(
            &request,
            Submission {
                definition: definition.into(),
                invocation: Invocation {
                    links_only: args.links_only,
                },
            },
        )
        .await
        .change_context(SubcommandError::Service)?;

    print(&serde_json::json!({ "run_id": run.as_ref() }));
    Ok(())
}

/// Prints the status of the run.
pub(crate) async fn status<R: Runs>(runs: R, args: RunArgs) -> Result<(), Report<SubcommandError>> {
    let status = args
        .request
        .service(runs)
        .status(&args.request.request(Uuid::new_v4()), &args.run)
        .await
        .change_context(SubcommandError::Service)?
        .ok_or(SubcommandError::UnknownRun)?;

    print(&StatusOutput {
        run_id: args.run.as_ref(),
        phase: status.phase.into(),
        steps_recorded: status.steps_recorded,
    });
    Ok(())
}

/// What `status` prints: the run's ID, its phase and how many steps it recorded. A failed run
/// also prints why it failed.
#[derive(Debug, Serialize)]
struct StatusOutput<'run> {
    run_id: &'run str,
    #[serde(flatten)]
    phase: Phase,
    steps_recorded: u32,
}

#[derive(Debug, Serialize)]
#[serde(tag = "phase", rename_all = "snake_case")]
enum Phase {
    Pending,
    Running,
    Completed,
    Failed { failure: String },
    Cancelled,
}

impl From<RunPhase> for Phase {
    fn from(phase: RunPhase) -> Self {
        match phase {
            RunPhase::Pending => Self::Pending,
            RunPhase::Running => Self::Running,
            RunPhase::Completed => Self::Completed,
            RunPhase::Failed(failure) => Self::Failed {
                failure: failure.to_string(),
            },
            RunPhase::Cancelled => Self::Cancelled,
        }
    }
}

/// Asks the run to stop before its next step.
pub(crate) async fn cancel<R: Runs>(runs: R, args: RunArgs) -> Result<(), Report<SubcommandError>> {
    args.request
        .service(runs)
        .cancel(&args.request.request(Uuid::new_v4()), &args.run)
        .await
        .change_context(SubcommandError::Service)?;

    print(&serde_json::json!({ "run_id": args.run.as_ref() }));
    Ok(())
}

#[expect(clippy::print_stdout, reason = "the JSON is the command's output")]
fn print(value: &impl Serialize) {
    println!(
        "{}",
        serde_json::to_string(value).expect("the output should serialize as JSON")
    );
}
