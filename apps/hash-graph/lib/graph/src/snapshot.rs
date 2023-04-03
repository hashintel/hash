mod entity;
mod metadata;
mod ontology;

use std::{fmt::Debug, pin::pin};

use error_stack::{Context, Report, Result};
use futures::{Sink, SinkExt, Stream, StreamExt, TryStreamExt};
use serde::{Deserialize, Serialize};
use type_system::{DataType, EntityType, PropertyType};

pub use self::{
    entity::EntityRecord,
    metadata::{BlockProtocolModuleVersions, CustomGlobalMetadata},
    ontology::{
        CustomOntologyMetadata, OntologyTemporalMetadata, OntologyTypeMetadata, OntologyTypeRecord,
    },
};
pub use crate::snapshot::metadata::SnapshotMetadata;
use crate::{
    knowledge::Entity,
    store::{crud::Read, query::Filter, InsertionError, QueryError},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum SnapshotEntry {
    Snapshot(SnapshotMetadata),
    DataType(OntologyTypeRecord<DataType>),
    PropertyType(OntologyTypeRecord<PropertyType>),
    EntityType(OntologyTypeRecord<EntityType>),
    Entity(EntityRecord),
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
    S: Read<OntologyTypeRecord<DataType>>
        + Read<OntologyTypeRecord<PropertyType>>
        + Read<OntologyTypeRecord<EntityType>>
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
    ) -> Result<(), QueryError> {
        futures::stream::once(async move {
            Ok(SnapshotEntry::Snapshot(SnapshotMetadata {
                block_protocol_module_versions: BlockProtocolModuleVersions {
                    graph: semver::Version::new(0, 3, 0),
                },
                custom: CustomGlobalMetadata,
            }))
        })
        .chain(
            Read::<OntologyTypeRecord<DataType>>::read(&self.0, &Filter::All(vec![]), None)
                .await?
                .map_ok(SnapshotEntry::DataType),
        )
        .chain(
            Read::<OntologyTypeRecord<PropertyType>>::read(&self.0, &Filter::All(vec![]), None)
                .await?
                .map_ok(SnapshotEntry::PropertyType),
        )
        .chain(
            Read::<OntologyTypeRecord<EntityType>>::read(&self.0, &Filter::All(vec![]), None)
                .await?
                .map_ok(SnapshotEntry::EntityType),
        )
        .chain(
            Read::<Entity>::read(&self.0, &Filter::All(vec![]), None)
                .await?
                .map_ok(|entity| SnapshotEntry::Entity(entity.into())),
        )
        .forward(sink.sink_map_err(|report| {
            report
                .change_context(QueryError)
                .attach_printable("failed to write record into sink")
        }))
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
        snapshot: impl Stream<Item = SnapshotEntry> + Send,
    ) -> Result<(), InsertionError> {
        let mut snapshot = pin!(snapshot);
        while let Some(entry) = snapshot.next().await {
            match entry {
                SnapshotEntry::Snapshot(global) => {
                    assert_eq!(
                        global.block_protocol_module_versions.graph,
                        semver::Version::new(0, 3, 0)
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
