pub mod codec;

mod entity;
mod error;
mod metadata;
mod ontology;

use std::pin::pin;

use error_stack::{ensure, Context, Report, Result, ResultExt};
use futures::{try_join, Sink, SinkExt, Stream, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};

pub use self::{
    entity::EntitySnapshotRecord,
    error::{SnapshotDumpError, SnapshotRestoreError},
    metadata::{BlockProtocolModuleVersions, CustomGlobalMetadata},
    ontology::{
        CustomOntologyMetadata, OntologyTemporalMetadata, OntologyTypeMetadata,
        OntologyTypeSnapshotRecord,
    },
};
pub use crate::snapshot::metadata::SnapshotMetadata;
use crate::{
    knowledge::Entity,
    store::{crud::Read, query::Filter},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SnapshotEntry {
    Snapshot(SnapshotMetadata),
    DataType(OntologyTypeSnapshotRecord<DataType>),
    PropertyType(OntologyTypeSnapshotRecord<PropertyType>),
    EntityType(OntologyTypeSnapshotRecord<EntityType>),
    Entity(EntitySnapshotRecord),
}

impl SnapshotEntry {
    pub fn install_error_stack_hook() {
        error_stack::Report::install_debug_hook::<Self>(|entry, context| match entry {
            Self::Snapshot(global_metadata) => {
                context.push_body(format!(
                    "graph version: {}",
                    global_metadata.block_protocol_module_versions.graph
                ));
            }
            Self::DataType(data_type) => {
                context.push_body(format!("data type: {}", data_type.metadata.record_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(data_type) {
                        context.push_appendix(format!("{}:\n{json}", data_type.metadata.record_id));
                    }
                }
            }
            Self::PropertyType(property_type) => {
                context.push_body(format!(
                    "property type: {}",
                    property_type.metadata.record_id
                ));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(property_type) {
                        context.push_appendix(format!(
                            "{}:\n{json}",
                            property_type.metadata.record_id
                        ));
                    }
                }
            }
            Self::EntityType(entity_type) => {
                context.push_body(format!("entity type: {}", entity_type.metadata.record_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(entity_type) {
                        context
                            .push_appendix(format!("{}:\n{json}", entity_type.metadata.record_id));
                    }
                }
            }
            Self::Entity(entity) => {
                context.push_body(format!("entity: {}", entity.metadata.record_id.entity_id));
                if context.alternate() {
                    if let Ok(json) = serde_json::to_string_pretty(entity) {
                        context.push_appendix(format!(
                            "{}:\n{json}",
                            entity.metadata.record_id.entity_id
                        ));
                    }
                }
            }
        });
    }
}

pub struct SnapshotStore<S>(S);

impl<S> SnapshotStore<S> {
    pub const fn new(store: S) -> Self {
        Self(store)
    }
}

#[expect(
    clippy::trait_duplication_in_bounds,
    reason = "False positive: the generics are different"
)]
impl<S> SnapshotStore<S>
where
    S: Read<OntologyTypeSnapshotRecord<DataType>>
        + Read<OntologyTypeSnapshotRecord<PropertyType>>
        + Read<OntologyTypeSnapshotRecord<EntityType>>
        + Read<Entity>
        + Send,
{
    /// Reads the snapshot from the store into the given sink.
    ///
    /// The sink is expected to be a `futures::Sink` that can be used to write the snapshot entries
    /// into.
    ///
    /// # Errors
    ///
    /// - If reading a record from the datastore fails
    /// - If writing a record into the sink fails
    pub async fn dump_snapshot(
        &self,
        sink: impl Sink<SnapshotEntry, Error = Report<impl Context>> + Send,
    ) -> Result<(), SnapshotDumpError> {
        let data_type_filter = Filter::All(vec![]);
        let property_type_filter = Filter::All(vec![]);
        let entity_type_filter = Filter::All(vec![]);
        let entity_filter = Filter::All(vec![]);

        let data_types =
            Read::<OntologyTypeSnapshotRecord<DataType>>::read(&self.0, &data_type_filter, None);
        let property_types = Read::<OntologyTypeSnapshotRecord<PropertyType>>::read(
            &self.0,
            &property_type_filter,
            None,
        );
        let entity_types = Read::<OntologyTypeSnapshotRecord<EntityType>>::read(
            &self.0,
            &entity_type_filter,
            None,
        );
        let entities = Read::<Entity>::read(&self.0, &entity_filter, None);

        let (data_type_stream, property_type_stream, entity_type_stream, entity_stream) =
            try_join!(data_types, property_types, entity_types, entities)
                .map_err(|report| report.change_context(SnapshotDumpError::Query))?;

        let metadata_stream = futures::stream::once(async move {
            Ok(SnapshotEntry::Snapshot(SnapshotMetadata {
                block_protocol_module_versions: BlockProtocolModuleVersions {
                    graph: semver::Version::new(0, 3, 0),
                },
                custom: CustomGlobalMetadata,
            }))
        });

        metadata_stream
            .chain(data_type_stream.map_ok(SnapshotEntry::DataType))
            .chain(property_type_stream.map_ok(SnapshotEntry::PropertyType))
            .chain(entity_type_stream.map_ok(SnapshotEntry::EntityType))
            .chain(entity_stream.map_ok(|entity| SnapshotEntry::Entity(entity.into())))
            .map_err(|report| report.change_context(SnapshotDumpError::Read))
            .forward(sink.sink_map_err(|report| report.change_context(SnapshotDumpError::Write)))
            .await
    }

    /// Reads the snapshot from from the stream into the store.
    ///
    /// # Errors
    ///
    /// - If writing the record into the datastore fails
    #[expect(
        clippy::todo,
        clippy::missing_panics_doc,
        reason = "This will be done in a follow-up"
    )]
    pub async fn restore_snapshot(
        &mut self,
        snapshot: impl Stream<Item = Result<SnapshotEntry, impl Context>> + Send,
    ) -> Result<(), SnapshotRestoreError> {
        let mut snapshot = pin!(snapshot);
        while let Some(entry) = snapshot.next().await {
            let entry = entry
                .change_context(SnapshotRestoreError::Canceled)
                .attach_printable("reading the records resulted in an error")?;

            match entry {
                SnapshotEntry::Snapshot(global) => {
                    ensure!(
                        global.block_protocol_module_versions.graph
                            == semver::Version::new(0, 3, 0),
                        SnapshotRestoreError::Unsupported
                    );
                }
                SnapshotEntry::DataType(data_type) => {
                    tracing::trace!(
                        "Inserting data type: {:?}",
                        data_type.metadata.record_id.base_url
                    );
                }
                SnapshotEntry::PropertyType(property_type) => {
                    tracing::trace!(
                        "Inserting property type: {:?}",
                        property_type.metadata.record_id.base_url
                    );
                }
                SnapshotEntry::EntityType(entity_type) => {
                    tracing::trace!(
                        "Inserting entity type: {:?}",
                        entity_type.metadata.record_id.base_url
                    );
                }
                SnapshotEntry::Entity(entity) => {
                    tracing::trace!(
                        "Inserting entity: {:?}",
                        entity.metadata.record_id.entity_id.entity_uuid
                    );
                }
            }
        }

        todo!("https://app.asana.com/0/0/1204216809501006/f")
    }
}
