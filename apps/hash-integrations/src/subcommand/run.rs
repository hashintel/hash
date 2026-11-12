use std::{fs, path::PathBuf};

use error_stack::{Report, ResultExt as _};
use hash_integrations_orchestration::{
    RunId, RunPhase, Runs,
    restate::{RestateBackend, RestateConfig},
};
use serde::Serialize;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use crate::service::{IntegrationService, Invocation, Request, Submission};

/// Why a subcommand failed.
#[derive(Debug, Clone, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum SubcommandError {
    #[display("the integration definition could not be read")]
    ReadDefinition,
    #[display("the integration service could not complete the request")]
    Service,
    #[display("no run has this ID")]
    UnknownRun,
}

/// Where the Restate server is.
#[derive(Debug, clap::Args)]
pub struct RestateArgs {
    /// The URL of Restate's ingress.
    #[clap(
        long,
        env = "HASH_RESTATE_INGRESS_URL",
        default_value = "http://localhost:8080"
    )]
    pub restate_ingress_url: String,

    /// The URL of Restate's admin API.
    #[clap(
        long,
        env = "HASH_RESTATE_ADMIN_URL",
        default_value = "http://localhost:9070"
    )]
    pub restate_admin_url: String,
}

impl RestateArgs {
    /// The backend on the Restate server these arguments name.
    pub(crate) fn backend(&self) -> RestateBackend {
        RestateBackend::new(RestateConfig {
            ingress_url: self.restate_ingress_url.clone(),
            admin_url: self.restate_admin_url.clone(),
        })
    }
}

#[derive(Debug, clap::Parser)]
pub struct SubmitArgs {
    #[clap(flatten)]
    pub restate: RestateArgs,

    /// The web the request is for.
    #[clap(long, env = "HASH_WEB_ID")]
    pub web: Uuid,

    /// The actor who makes the request.
    #[clap(long, env = "HASH_ACTOR_ID")]
    pub actor: Uuid,

    /// The path of the integration definition.
    pub definition: PathBuf,

    /// Load only the links of the integration.
    #[clap(long)]
    pub links_only: bool,

    /// The ID of the request. Repeating the request with the same ID, actor, definition and
    /// options attaches to the run it started; without an ID, every submission starts a new run.
    #[clap(long)]
    pub request_id: Option<Uuid>,
}

#[derive(Debug, clap::Parser)]
pub struct RunArgs {
    #[clap(flatten)]
    pub restate: RestateArgs,

    /// The web the run belongs to.
    #[clap(long, env = "HASH_WEB_ID")]
    pub web: Uuid,

    /// The ID of the run.
    pub run: RunId,
}

/// Starts the run of the definition, or attaches to the run its request ID started, and prints
/// the run's ID.
///
/// # Errors
///
/// - [`SubcommandError::ReadDefinition`] if the definition file cannot be read.
/// - [`SubcommandError::Service`] if the integration service could not start the run.
pub(crate) async fn submit<R: Runs>(
    runs: R,
    args: SubmitArgs,
) -> Result<(), Report<SubcommandError>> {
    let definition = fs::read_to_string(&args.definition)
        .change_context(SubcommandError::ReadDefinition)
        .attach_with(|| args.definition.display().to_string())?;
    let web = WebId::new(args.web);
    let request = Request {
        web,
        actor: ActorEntityUuid::new(args.actor),
        id: args.request_id.unwrap_or_else(Uuid::new_v4),
    };

    let run = IntegrationService::new(runs, web)
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
///
/// # Errors
///
/// - [`SubcommandError::Service`] if the integration service could not read the run.
/// - [`SubcommandError::UnknownRun`] if no run has this ID.
pub(crate) async fn status<R: Runs>(runs: R, args: RunArgs) -> Result<(), Report<SubcommandError>> {
    let web = WebId::new(args.web);
    let status = IntegrationService::new(runs, web)
        .status(web, &args.run)
        .await
        .change_context(SubcommandError::Service)?
        .ok_or_else(|| Report::new(SubcommandError::UnknownRun).attach(args.run.to_string()))?;

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

/// Asks the run to stop before its next step. Cancelling a finished or unknown run succeeds.
///
/// # Errors
///
/// - [`SubcommandError::Service`] if the integration service could not record the request.
pub(crate) async fn cancel<R: Runs>(runs: R, args: RunArgs) -> Result<(), Report<SubcommandError>> {
    let web = WebId::new(args.web);
    IntegrationService::new(runs, web)
        .cancel(web, &args.run)
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
