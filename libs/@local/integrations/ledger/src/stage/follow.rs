//! Follows an integration whose collector writes each table of its definition to a Delta table:
//! takes a run through every stage each time a table has rows the last completed run did not
//! capture.

use alloc::{collections::BTreeMap, sync::Arc};

use error_stack::{Report, ResultExt as _};
use hash_integrations_definition::{Definition, SourceName};
use time::OffsetDateTime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use url::Url;

use super::{
    GraphClient,
    capture::{ChangesError, SourceTable, capture_changes, last_watermarks},
    prepare_incremental, send,
};
use crate::{
    run::{RunId, StartInput, current, start},
    storage::{IntegrationNamespace, S3Bucket, Storage, open_bucket},
};

/// The folder below an integration's place in the bucket that its collector writes a Delta table
/// per table to.
const COLLECTED: &str = "dlt";

/// Reports why a [`Follower`] could not take a step.
#[derive(Debug, Clone, Copy, PartialEq, Eq, derive_more::Display, derive_more::Error)]
pub enum FollowError {
    #[display("the definition is not valid")]
    Definition,
    #[display("the bucket could not be used")]
    Storage,
    #[display("the run could not be started")]
    Start,
    #[display("a stage of the run failed")]
    Stage,
}

/// What one [`Follower::step`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Step {
    /// No table has rows to capture, or a table has not been collected yet.
    Idle,
    /// The run went through every stage.
    Completed { run: RunId },
}

/// Follows one integration: its definition, its place in the bucket and the Graph it writes to.
#[derive(Debug)]
pub struct Follower {
    storage: Storage,
    definition: Definition,
    yaml: Box<str>,
    web: WebId,
    actor: ActorEntityUuid,
    graph: GraphClient,
    /// The Delta table of each table of the definition, by the table's name.
    tables: BTreeMap<SourceName, Url>,
}

impl Follower {
    /// Follows the integration of the definition `yaml` in `web`, whose state is in `bucket`, and
    /// writes its entities as `actor` through `graph`.
    ///
    /// # Errors
    ///
    /// Returns [`FollowError::Definition`] if `yaml` is not a valid definition, and
    /// [`FollowError::Storage`] if `bucket` is not valid.
    pub fn new(
        bucket: S3Bucket,
        yaml: &str,
        web: WebId,
        actor: ActorEntityUuid,
        graph: GraphClient,
    ) -> Result<Self, Report<FollowError>> {
        let definition = Definition::from_yaml(yaml).change_context(FollowError::Definition)?;
        let namespace = IntegrationNamespace::new(web.into(), definition.connector());
        let storage = Storage::s3(bucket, &namespace).change_context(FollowError::Storage)?;
        let root = storage
            .bucket()
            .ok_or_else(|| Report::new(FollowError::Storage).attach("the storage has no bucket"))?
            .uri
            .trim_end_matches('/')
            .to_owned();
        let tables = definition
            .sources()
            .iter()
            .filter(|(_, source)| source.primary_key().is_some())
            .map(|(table, _)| {
                Url::parse(&format!("{root}/{COLLECTED}/{table}"))
                    .map(|url| (table.clone(), url))
                    .change_context(FollowError::Storage)
            })
            .collect::<Result<_, _>>()?;
        Ok(Self {
            storage,
            definition,
            yaml: yaml.into(),
            web,
            actor,
            graph,
            tables,
        })
    }

    /// Takes one step: continues the active run, or starts a run if a table has rows the last
    /// completed run did not capture, and takes the run through every stage.
    ///
    /// # Errors
    ///
    /// - [`FollowError::Storage`] if the state of the integration or a table cannot be read
    /// - [`FollowError::Start`] if the run cannot be started
    /// - [`FollowError::Stage`] if a stage failed; its error says whether trying again can help. A
    ///   run that failed for good stays active, and every later step fails with it.
    pub async fn step(&self) -> Result<Step, Report<FollowError>> {
        let (current, _) = current::read(&self.storage)
            .await
            .change_context(FollowError::Storage)?;
        let run = match current.active {
            Some(run) => run,
            None if self.has_new_rows().await? => {
                let run = RunId::new();
                start(
                    &self.storage,
                    &self.definition,
                    StartInput {
                        run,
                        web: self.web,
                        actor: self.actor,
                        definition: self.yaml.clone(),
                        submitted_at: OffsetDateTime::now_utc(),
                    },
                )
                .await
                .change_context(FollowError::Start)?;
                run
            }
            None => return Ok(Step::Idle),
        };
        capture_changes(&self.storage, run, &self.tables)
            .await
            .change_context(FollowError::Stage)?;
        prepare_incremental(&self.storage, run)
            .await
            .change_context(FollowError::Stage)?;
        send(&self.storage, run, &self.graph)
            .await
            .change_context(FollowError::Stage)?;
        Ok(Step::Completed { run })
    }

    /// Whether every table has been collected and one of them has a version the last completed
    /// run did not capture.
    async fn has_new_rows(&self) -> Result<bool, Report<FollowError>> {
        let last = last_watermarks(&self.storage)
            .await
            .change_context(FollowError::Storage)?;
        let captured = self
            .tables
            .iter()
            .map(|(table, url)| {
                let version = last
                    .get(table.as_ref())
                    .filter(|watermark| *watermark.table == *url.as_str())
                    .map(|watermark| watermark.to_version);
                (url.clone(), version)
            })
            .collect::<Vec<_>>();
        let objects = self
            .storage
            .bucket()
            .ok_or_else(|| Report::new(FollowError::Storage).attach("the storage has no bucket"))
            .and_then(|bucket| open_bucket(bucket).change_context(FollowError::Storage))?;
        // delta-kernel blocks, so the versions are read on a blocking thread.
        tokio::task::spawn_blocking(move || {
            let mut new_rows = false;
            for (url, captured) in captured {
                match SourceTable::open(Arc::clone(&objects), url).version() {
                    Ok(version) => new_rows |= captured.is_none_or(|captured| version > captured),
                    // A table the collector has not written yet: the run waits for it.
                    Err(report) if *report.current_context() == ChangesError::Invalid => {
                        return Ok(false);
                    }
                    Err(report) => return Err(report.change_context(FollowError::Storage)),
                }
            }
            Ok(new_rows)
        })
        .await
        .change_context(FollowError::Storage)?
    }
}
