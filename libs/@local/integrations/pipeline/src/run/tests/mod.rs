//! Shared behavioral fixtures and foundation acceptance checks.
mod capture;
mod current;
mod diff;
mod error;
pub(crate) mod fixtures;
mod graph_http;
mod marker;
mod plan;
mod scenarios;
mod start;
mod table;
mod takeover;

use std::{fs, path::Path};

use hash_integrations_definition::ConnectorId;
use time::macros::datetime;
use type_system::principal::{actor::ActorEntityUuid, actor_group::WebId};
use uuid::Uuid;

use crate::{
    ArtifactStorage, CaptureLimits, CaptureStore, FixedClock, OperationRequest, RunContext, RunId,
    RunRequest, SendSettings, SourceReader, WorkspaceConfig,
};

pub(crate) fn connector() -> ConnectorId {
    "aviation"
        .parse()
        .expect("should parse the fixture connector")
}
pub(crate) fn run_id(number: u128) -> RunId {
    RunId::from(Uuid::from_u128(0x4000_8000_0000_0000_00A0 + number))
}
pub(crate) fn context(directory: &Path) -> RunContext {
    let scratch = directory.join(format!("scratch-{}", Uuid::new_v4()));
    fs::create_dir_all(&scratch).expect("should create scratch directory");
    RunContext::new(
        ArtifactStorage::local(&directory.join("artifacts")).expect("should open artifact storage"),
        WebId::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0001)),
        &connector(),
        scratch,
        WorkspaceConfig::default(),
        SendSettings::default(),
        Box::new(FixedClock(datetime!(2026-11-06 12:00 UTC))),
    )
}
pub(crate) fn reader(context: &RunContext, directory: &Path) -> SourceReader {
    let local = directory.join("local");
    fs::create_dir_all(&local).expect("should create the local source root");
    SourceReader::new(
        CaptureStore::new(&local, context.storage.clone()).expect("should open the source reader"),
        CaptureLimits::default(),
    )
}
pub(crate) fn apply(run: RunId, definition: &str) -> RunRequest {
    RunRequest {
        run,
        web: WebId::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0001)),
        connector: connector(),
        actor: ActorEntityUuid::new(Uuid::from_u128(0x0000_0000_0000_4000_8000_0000_0000_0002)),
        operation: OperationRequest::Apply {
            definition: definition.into(),
            namespace: "aviation".into(),
            resend_all: false,
        },
        allow_mass_archive: false,
    }
}
