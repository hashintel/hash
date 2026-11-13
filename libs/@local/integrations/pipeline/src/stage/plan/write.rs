//! Ordered write batching and bounded blocking checkpoint publication.
use alloc::collections::BTreeMap;

use error_stack::Report;

use super::rows::ChangeRow;
use crate::{
    ArtifactRef, Change, Code, RunContext, StageError, Target,
    graph::{ConversionFailure, FailureReason, OperationKind},
    run::table::{BufferedFile, Cell, Column, ColumnKind},
};

const BATCH_WRITES: u32 = 128;
const BATCH_BYTES: u64 = 1_500_000;
const GRAPH_BODY_BYTES: usize = 2 * 1024 * 1024 - 2;

const WRITES: [Column; 11] = [
    Column {
        name: "seq",
        kind: ColumnKind::UInt64,
        nullable: false,
    },
    Column {
        name: "batch",
        kind: ColumnKind::UInt32,
        nullable: false,
    },
    Column {
        name: "operation",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "change",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "entity_id",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "target",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "source_id",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "left_entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "right_entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "create",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "patch",
        kind: ColumnKind::Text,
        nullable: false,
    },
];
const ISSUES: [Column; 7] = [
    Column {
        name: "kind",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "target",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "entity_id",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "key",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "issue",
        kind: ColumnKind::Text,
        nullable: false,
    },
    Column {
        name: "property",
        kind: ColumnKind::Text,
        nullable: true,
    },
    Column {
        name: "reason",
        kind: ColumnKind::Text,
        nullable: true,
    },
];

pub(super) struct Write {
    pub operation: OperationKind,
    pub change: Change,
    pub entity_id: Box<str>,
    pub target: Box<str>,
    pub source_id: Box<str>,
    pub left: Option<Box<str>>,
    pub right: Option<Box<str>>,
    pub create: Option<Box<str>>,
    pub patch: Box<str>,
}

/// The open batch carries no bodies; the file buffer owns them until its next flush.
struct OpenBatch {
    operation: OperationKind,
    create: bool,
    number: u32,
    writes: u32,
    bytes: u64,
}

#[derive(Default)]
struct Batcher {
    next: u32,
    open: Option<OpenBatch>,
}

impl Batcher {
    fn assign(
        &mut self,
        operation: OperationKind,
        create: bool,
        bytes: u64,
    ) -> Result<u32, Report<StageError>> {
        let fits = self.open.as_ref().is_some_and(|open| {
            open.operation == operation
                && open.create == create
                && open.writes < BATCH_WRITES
                && open.bytes.saturating_add(bytes) <= BATCH_BYTES
        });
        if !fits {
            let number = self.next;
            self.next = number
                .checked_add(1)
                .ok_or_else(|| Code::PlanTooLarge.report())?;
            self.open = Some(OpenBatch {
                operation,
                create,
                number,
                writes: 0,
                bytes: 0,
            });
        }
        let open = self
            .open
            .as_mut()
            .ok_or_else(|| Code::InvalidCheckpoint.report())?;
        open.writes += 1;
        open.bytes = open.bytes.saturating_add(bytes);
        Ok(open.number)
    }
}

pub(super) struct WriteFile {
    file: BufferedFile,
    batcher: Batcher,
    seq: u64,
    counts: BTreeMap<OperationKind, u64>,
}

impl WriteFile {
    pub(super) async fn create(context: &RunContext) -> Result<Self, Report<StageError>> {
        Ok(Self {
            file: BufferedFile::create(context, &WRITES).await?,
            batcher: Batcher::default(),
            seq: 0,
            counts: [
                OperationKind::UpsertEntity,
                OperationKind::UpsertLink,
                OperationKind::ArchiveLink,
                OperationKind::ArchiveEntity,
            ]
            .into_iter()
            .map(|kind| (kind, 0))
            .collect(),
        })
    }

    pub(super) async fn push(&mut self, write: Write) -> Result<(), Report<StageError>> {
        let create = write.change == Change::Insert;
        let first = if create {
            write
                .create
                .as_deref()
                .ok_or_else(|| Code::InvalidCheckpoint.report())?
        } else {
            &write.patch
        };
        let batch = self
            .batcher
            .assign(write.operation, create, first.len() as u64)?;
        let bytes = write
            .create
            .as_ref()
            .map_or(0, |body| body.len())
            .max(write.patch.len());
        if bytes > GRAPH_BODY_BYTES {
            tracing::warn!(entity_id = %write.entity_id, operation = write.operation.as_str(), bytes, "planned body exceeds the Graph request limit");
        }
        self.file
            .push(Box::new([
                Cell::UInt(self.seq),
                Cell::UInt(u64::from(batch)),
                Cell::Text(write.operation.as_str().into()),
                Cell::Text(write.change.as_str().into()),
                Cell::Text(write.entity_id),
                Cell::Text(write.target),
                Cell::Text(write.source_id),
                write.left.map_or(Cell::Null, Cell::Text),
                write.right.map_or(Cell::Null, Cell::Text),
                write.create.map_or(Cell::Null, Cell::Text),
                Cell::Text(write.patch),
            ]))
            .await?;
        self.seq += 1;
        *self.counts.entry(write.operation).or_default() += 1;
        Ok(())
    }

    pub(super) async fn store(
        self,
        context: &RunContext,
        issues: ArtifactRef,
    ) -> Result<super::PlanOutput, Report<StageError>> {
        Ok(super::PlanOutput {
            writes: self.file.store(context).await?,
            issues,
            batches: self.batcher.next,
            counts: self.counts,
        })
    }
}

pub(super) struct IssueFile(BufferedFile);

impl IssueFile {
    pub(super) async fn create(context: &RunContext) -> Result<Self, Report<StageError>> {
        Ok(Self(BufferedFile::create(context, &ISSUES).await?))
    }

    pub(super) async fn push(
        &mut self,
        target: &Target,
        row: &ChangeRow<'_>,
        failure: &ConversionFailure,
    ) -> Result<(), Report<StageError>> {
        let reason = match failure.reason {
            FailureReason::Coercion(_) => "coercion",
            FailureReason::MeasureAmount => "measure_amount",
            FailureReason::MeasureUnit => "measure_unit",
            FailureReason::Unsupported(_) => "unsupported",
        };
        self.0
            .push(Box::new([
                Cell::Text(target.kind().as_str().into()),
                Cell::Text(target.id().into()),
                Cell::Text(row.entity_id.into()),
                row.key.map_or(Cell::Null, |key| Cell::Text(key.into())),
                Cell::Text("property_unconverted".into()),
                Cell::Text(failure.property.to_string().into_boxed_str()),
                Cell::Text(reason.into()),
            ]))
            .await
    }

    pub(super) async fn store(
        self,
        context: &RunContext,
    ) -> Result<ArtifactRef, Report<StageError>> {
        self.0.store(context).await
    }
}

#[cfg(test)]
mod tests {
    use duckdb::types::Value;
    use hash_integrations_definition::Variables;
    use rstest::rstest;
    use similar_asserts::assert_eq;
    use tempfile::TempDir;

    use super::{Batcher, Write, WriteFile};
    use crate::{
        Change, Code,
        graph::OperationKind,
        run::{
            table::load_table,
            tests::{context, fixtures::store_expected},
        },
    };

    #[rstest]
    #[case(750_000, 0)]
    #[case(750_001, 1)]
    fn batch_exact_byte_boundary(#[case] second: u64, #[case] batch: u32) {
        let mut batcher = Batcher::default();
        assert_eq!(
            batcher
                .assign(OperationKind::UpsertEntity, true, 750_000)
                .expect("should start batch"),
            0
        );
        assert_eq!(
            batcher
                .assign(OperationKind::UpsertEntity, true, second)
                .expect("should assign next body"),
            batch
        );
    }

    #[test]
    fn batch_counter_limit() {
        let mut batcher = Batcher {
            next: u32::MAX,
            open: None,
        };
        let error = batcher
            .assign(OperationKind::UpsertEntity, true, 1)
            .expect_err("should fail before batch counter overflows");
        assert_eq!(Code::of(&error), Some(Code::PlanTooLarge));
    }

    #[tokio::test]
    async fn write_batches_count_first_body_only() {
        let directory = TempDir::new().expect("should create fixture directory");
        let context = context(directory.path());
        let mut file = WriteFile::create(&context)
            .await
            .expect("should create writer");
        // The writer treats body text as opaque. The fixed JSON-string lengths below are
        // independent of request planning and distinguish first-request from fallback bytes.
        for identity in [1, 2] {
            file.push(Write {
                operation: OperationKind::UpsertEntity,
                change: Change::Update,
                entity_id: identity.to_string().into_boxed_str(),
                target: "sink".into(),
                source_id: "source".into(),
                left: None,
                right: None,
                create: Some(format!("\"{}\"", "x".repeat(999_998)).into_boxed_str()),
                patch: "\"12345678\"".into(),
            })
            .await
            .expect("should batch by ten-byte patch bodies");
        }
        let issues =
            store_expected(&context, &serde_json::json!({"schema":"issues","rows":[]})).await;
        let output = file
            .store(&context, issues)
            .await
            .expect("should store planned writes");
        assert_eq!(output.batches, 1);
        let workspace = context
            .open_workspace(Variables::default())
            .await
            .expect("should open consumer");
        load_table(&context, &workspace, &output.writes, "writes".into())
            .await
            .expect("should load writes");
        let rows = workspace
            .query(
                "SELECT batch, length(\"create\"), length(patch) FROM writes ORDER BY seq".into(),
            )
            .await
            .expect("should inspect bodies and batches");
        assert_eq!(
            rows.iter().map(<[Value]>::to_vec).collect::<Vec<_>>(),
            vec![vec![Value::UInt(0), Value::BigInt(1_000_000), Value::BigInt(10)]; 2]
        );
        workspace.close().await.expect("should close consumer");
    }
}
