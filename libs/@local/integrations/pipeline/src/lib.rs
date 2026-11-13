//! A checkpointed ingestion pipeline with immutable stage outputs and conditional run state.
#![feature(
    const_array,
    const_closures,
    const_trait_impl,
    ip,
    type_info,
    variant_count
)]

extern crate alloc;

mod byte_size;
mod capture;
mod entity_id;
pub mod graph;
pub mod orchestration;
mod pipeline;
pub mod run;
pub mod service;
pub mod sources;
mod sql;
pub mod stage;
mod storage;
mod variant_name;
mod workspace;

pub use self::{
    byte_size::ByteSize,
    capture::{CaptureError, SourceCapture},
    entity_id::{LinkEndpoint, derive_entity_id},
    pipeline::{
        AssertionFailure, PreparationError, PreparedLink, PreparedPipeline, PreparedSink,
        TableAssertions,
    },
    run::{
        Change, Clock, Code, FixedClock, InvalidText, Kind, Operation, OperationRequest,
        RunContext, RunId, RunInput, RunRequest, SendSettings, StageError, SystemClock, Target,
        run, start,
    },
    sources::{
        CaptureLimits, CaptureRun, CaptureStore, CapturedSource, GraphVaultConfig,
        GraphVaultSecretStore, SecretService, SecretStore, SecretValue, SourceError, SourceReader,
    },
    storage::{
        ArtifactError, ArtifactKey, ArtifactNamespace, ArtifactRef, ArtifactRefV1, ArtifactStorage,
        Format, S3Bucket,
    },
    workspace::{
        CloseError, DataErrorType, DiskUsageError, OpenError, QueryErrorType, Rows, Setting,
        SnapshotError, StatementError, Workspace, WorkspaceConfig,
    },
};
