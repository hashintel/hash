//! Executes the same pipeline functions as the local runner, one durable step at a time.

#[cfg(test)]
mod tests;

use std::path::{Path, PathBuf};

use error_stack::{Report, ResultExt as _};
use tempfile::TempDir;
use type_system::principal::actor_group::WebId;

use super::start::FUNCTION_VERSION;
use crate::{
    ArtifactStorage, CaptureLimits, CaptureStore, Code, RunContext, RunRequest, SecretStore,
    SendSettings, SourceError, SourceReader, StageError, SystemClock, WorkspaceConfig,
    graph::Graph,
    orchestration::{
        FailureCode, FailureKind, FunctionVersion, RunError, RunFunction, StepContext, StepFailure,
        StepName,
    },
    stage::{capture::capture, diff::diff, plan::plan, send::send},
    start,
};

/// Runs the pipeline as five deterministic steps supplied by a workflow backend.
///
/// Each invocation owns fresh scratch. Completed steps replay descriptions of persisted artifacts;
/// retrying an unrecorded step reuses its winning pipeline marker.
pub struct PipelineFunction<S, G> {
    web: WebId,
    storage: ArtifactStorage,
    scratch: PathBuf,
    workspace: WorkspaceConfig,
    send: SendSettings,
    sources: SourceReader,
    secrets: S,
    graph: G,
}

impl<S: SecretStore, G: Graph> PipelineFunction<S, G> {
    /// Configures one web's pipeline with default workspace, capture, and delivery limits.
    ///
    /// `storage` holds both captures and stage markers. `local_sources` and the storage directory
    /// must be disjoint, while `scratch` is an existing parent for temporary run directories.
    ///
    /// # Errors
    /// Returns [`SourceError`] if the local source root and capture storage cannot be configured.
    pub fn new(
        web: WebId,
        storage: ArtifactStorage,
        local_sources: &Path,
        scratch: PathBuf,
        secrets: S,
        graph: G,
    ) -> Result<Self, Report<SourceError>> {
        let sources = SourceReader::new(
            CaptureStore::new(local_sources, storage.clone())?,
            CaptureLimits::default(),
        );
        Ok(Self {
            web,
            storage,
            scratch,
            workspace: WorkspaceConfig::default(),
            send: SendSettings::default(),
            sources,
            secrets,
            graph,
        })
    }
}

impl<S: SecretStore, G: Graph> RunFunction for PipelineFunction<S, G> {
    type Input = RunRequest;

    const VERSION: FunctionVersion = FUNCTION_VERSION;

    #[tracing::instrument(level = "debug", skip_all, fields(web_id = %input.web, run_id = %input.run))]
    async fn run(
        &self,
        context: &mut impl StepContext,
        input: RunRequest,
    ) -> Result<(), Report<RunError>> {
        if input.web != self.web {
            return Err(Report::new(RunError::Failed {
                code: failure_code("web_mismatch"),
            }));
        }
        let scratch = TempDir::new_in(&self.scratch).change_context(RunError::Failed {
            code: failure_code("scratch_unavailable"),
        })?;
        let run_context = RunContext::new(
            self.storage.clone(),
            input.web,
            &input.connector,
            scratch.path().to_owned(),
            self.workspace.clone(),
            self.send,
            Box::new(SystemClock),
        );
        let input = context
            .run(step_name("start"), || async {
                start(&run_context, input.clone())
                    .await
                    .map_err(step_failure)
            })
            .await?;
        let captured = context
            .run(step_name("capture"), || async {
                capture(&run_context, &input, &self.sources, &self.secrets)
                    .await
                    .map_err(step_failure)
            })
            .await?;
        let diffed = context
            .run(step_name("diff"), || async {
                diff(&run_context, &input, &captured)
                    .await
                    .map_err(step_failure)
            })
            .await?;
        let planned = context
            .run(step_name("plan"), || async {
                plan(&run_context, &input, &captured, &diffed)
                    .await
                    .map_err(step_failure)
            })
            .await?;
        context
            .run(step_name("send"), || async {
                send(&run_context, &input, &diffed, &planned, &self.graph)
                    .await
                    .map_err(step_failure)
            })
            .await?;
        Ok(())
    }
}

fn step_name(text: &'static str) -> StepName {
    text.parse().expect("a stage name should be a step name")
}

fn failure_code(text: &str) -> FailureCode {
    text.parse().expect("a code should be a failure code")
}

fn step_failure(report: Report<StageError>) -> Report<StepFailure> {
    let kind = match report.current_context() {
        StageError::Retryable => FailureKind::Retryable,
        StageError::Permanent => FailureKind::Permanent,
    };
    let code = failure_code(Code::of(&report).map_or("unclassified", Code::as_str));
    report.change_context(StepFailure { kind, code })
}
