use std::{
    pin::Pin,
    task::{ready, Context, Poll},
};

use authorization::schema::{EntityTypeId, EntityTypeRelationAndSubject};
use error_stack::{Report, ResultExt};
use futures::{
    channel::mpsc::{self, Sender},
    stream::{select_all, BoxStream, SelectAll},
    Sink, SinkExt, Stream, StreamExt,
};
use graph_types::ontology::{OntologyElementMetadata, OntologyTypeVersion};
use postgres_types::Json;
use type_system::EntityType;
use uuid::Uuid;

use crate::snapshot::{
    ontology::{
        entity_type::batch::EntityTypeRowBatch,
        table::{
            EntityTypeConstrainsLinkDestinationsOnRow, EntityTypeConstrainsLinksOnRow,
            EntityTypeConstrainsPropertiesOnRow, EntityTypeInheritsFromRow, EntityTypeRow,
        },
        EntityTypeSnapshotRecord, OntologyTypeMetadataSender,
    },
    SnapshotRestoreError,
};

/// A sink to insert [`EntityTypeSnapshotRecord`]s.
///
/// An `EntityTypeSender` with the corresponding [`EntityTypeReceiver`] are created using the
/// [`entity_type_channel`] function.
#[derive(Debug, Clone)]
pub struct EntityTypeSender {
    metadata: OntologyTypeMetadataSender,
    schema: Sender<EntityTypeRow>,
    inherits_from: Sender<Vec<EntityTypeInheritsFromRow>>,
    constrains_properties: Sender<Vec<EntityTypeConstrainsPropertiesOnRow>>,
    constrains_links: Sender<Vec<EntityTypeConstrainsLinksOnRow>>,
    constrains_link_destinations: Sender<Vec<EntityTypeConstrainsLinkDestinationsOnRow>>,
    relations: Sender<(EntityTypeId, EntityTypeRelationAndSubject)>,
}

// This is a direct wrapper around several `Sink<mpsc::Sender>` and `OntologyTypeMetadataSender`
// with error-handling added to make it easier to use. It's taking an `OntologyTypeSnapshotRecord`
// and sending the individual rows to the corresponding sinks.
impl Sink<EntityTypeSnapshotRecord> for EntityTypeSender {
    type Error = Report<SnapshotRestoreError>;

    fn poll_ready(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_ready_unpin(cx))
            .attach_printable("could not poll ontology type sender")?;
        ready!(self.schema.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll schema sender")?;
        ready!(self.inherits_from.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll inherits from edge sender")?;
        ready!(self.constrains_properties.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains properties edge sender")?;
        ready!(self.constrains_links.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains links edge sender")?;
        ready!(self.constrains_link_destinations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll constrains link destinations edge sender")?;
        ready!(self.relations.poll_ready_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not poll relations sender")?;

        Poll::Ready(Ok(()))
    }

    #[expect(clippy::too_many_lines)]
    fn start_send(
        mut self: Pin<&mut Self>,
        entity_type: EntityTypeSnapshotRecord,
    ) -> Result<(), Self::Error> {
        let schema = EntityType::try_from(entity_type.schema)
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not convert schema to entity type")?;

        let record_id = entity_type.metadata.record_id.to_string();
        let ontology_id = Uuid::new_v5(&Uuid::NAMESPACE_URL, record_id.as_bytes());

        self.metadata
            .start_send_unpin((
                ontology_id,
                OntologyElementMetadata {
                    record_id: entity_type.metadata.record_id,
                    custom: entity_type.metadata.custom,
                },
            ))
            .attach_printable("could not send metadata")?;

        let inherits_from: Vec<_> = schema
            .inherits_from()
            .all_of()
            .iter()
            .map(|entity_type_ref| {
                let url = entity_type_ref.url();
                EntityTypeInheritsFromRow {
                    source_entity_type_ontology_id: ontology_id,
                    target_entity_type_base_url: url.base_url.as_str().to_owned(),
                    target_entity_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !inherits_from.is_empty() {
            self.inherits_from
                .start_send_unpin(inherits_from)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send inherits from edge")?;
        }

        let properties: Vec<_> = schema
            .property_type_references()
            .into_iter()
            .map(|entity_type_ref| {
                let url = entity_type_ref.url();
                EntityTypeConstrainsPropertiesOnRow {
                    source_entity_type_ontology_id: ontology_id,
                    target_property_type_base_url: url.base_url.as_str().to_owned(),
                    target_property_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !properties.is_empty() {
            self.constrains_properties
                .start_send_unpin(properties)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains properties edge")?;
        }

        // TODO: Add better functions to the `type-system` crate to easier read link mappings
        let link_mappings = schema.link_mappings();

        let links: Vec<_> = link_mappings
            .keys()
            .map(|entity_type_ref| {
                let url = entity_type_ref.url();
                EntityTypeConstrainsLinksOnRow {
                    source_entity_type_ontology_id: ontology_id,
                    target_entity_type_base_url: url.base_url.as_str().to_owned(),
                    target_entity_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !links.is_empty() {
            self.constrains_links
                .start_send_unpin(links)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains links edge")?;
        }

        let link_destinations: Vec<_> = link_mappings
            .into_values()
            .flat_map(Option::unwrap_or_default)
            .map(|entity_type_ref| {
                let url = entity_type_ref.url();
                EntityTypeConstrainsLinkDestinationsOnRow {
                    source_entity_type_ontology_id: ontology_id,
                    target_entity_type_base_url: url.base_url.as_str().to_owned(),
                    target_entity_type_version: OntologyTypeVersion::new(url.version),
                }
            })
            .collect();
        if !link_destinations.is_empty() {
            self.constrains_link_destinations
                .start_send_unpin(link_destinations)
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send constrains link destinations edge")?;
        }

        self.schema
            .start_send_unpin(EntityTypeRow {
                ontology_id,
                schema: Json(schema.clone().into()),
                // The unclosed schema is inserted initially. This will be replaced later by the
                // closed schema.
                closed_schema: Json(schema.into()),
                label_property: entity_type
                    .metadata
                    .label_property
                    .map(|label_property| label_property.to_string()),
                icon: entity_type.metadata.icon,
            })
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not send schema")?;

        for relationships in entity_type.relations {
            self.relations
                .start_send_unpin((EntityTypeId::new(ontology_id), relationships))
                .change_context(SnapshotRestoreError::Read)
                .attach_printable("could not send entity relations")?;
        }

        Ok(())
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_flush_unpin(cx))
            .attach_printable("could not flush ontology type sender")?;
        ready!(self.schema.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush schema sender")?;
        ready!(self.inherits_from.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush inherits from edge sender")?;
        ready!(self.constrains_properties.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains properties edge sender")?;
        ready!(self.constrains_links.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains links edge sender")?;
        ready!(self.constrains_link_destinations.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush constrains link destinations edge sender")?;
        ready!(self.relations.poll_flush_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not flush relations sender")?;

        Poll::Ready(Ok(()))
    }

    fn poll_close(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        ready!(self.metadata.poll_close_unpin(cx))
            .attach_printable("could not close ontology type sender")?;
        ready!(self.schema.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close schema sender")?;
        ready!(self.inherits_from.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close inherits from edge sender")?;
        ready!(self.constrains_properties.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains properties edge sender")?;
        ready!(self.constrains_links.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains links edge sender")?;
        ready!(self.constrains_link_destinations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close constrains link destinations edge sender")?;
        ready!(self.relations.poll_close_unpin(cx))
            .change_context(SnapshotRestoreError::Read)
            .attach_printable("could not close relations sender")?;

        Poll::Ready(Ok(()))
    }
}

/// A stream to receive [`EntityTypeRowBatch`]es.
///
/// An `EntityTypeReceiver` with the corresponding [`EntityTypeSender`] are created using the
/// [`entity_type_channel`] function.
pub struct EntityTypeReceiver {
    stream: SelectAll<BoxStream<'static, EntityTypeRowBatch>>,
}

// This is a direct wrapper around the underlying stream, batches the row in chunks, and unifies
// the `Item` into a single enumeration.
impl Stream for EntityTypeReceiver {
    type Item = EntityTypeRowBatch;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.stream.poll_next_unpin(cx)
    }
}

/// Create a new [`EntityTypeSender`] and [`EntityTypeReceiver`] pair.
///
/// The `chunk_size` parameter is used to batch the rows into chunks of the given size.
pub fn entity_type_channel(
    chunk_size: usize,
    metadata_sender: OntologyTypeMetadataSender,
) -> (EntityTypeSender, EntityTypeReceiver) {
    let (schema_tx, schema_rx) = mpsc::channel(chunk_size);
    let (inherits_from_tx, inherits_from_rx) = mpsc::channel(chunk_size);
    let (constrains_properties_tx, constrains_properties_rx) = mpsc::channel(chunk_size);
    let (constrains_links_tx, constrains_links_rx) = mpsc::channel(chunk_size);
    let (constrains_link_destinations_tx, constrains_link_destinations_rx) =
        mpsc::channel(chunk_size);
    let (relations_tx, relations_rx) = mpsc::channel(chunk_size);

    (
        EntityTypeSender {
            metadata: metadata_sender,
            schema: schema_tx,
            inherits_from: inherits_from_tx,
            constrains_properties: constrains_properties_tx,
            constrains_links: constrains_links_tx,
            constrains_link_destinations: constrains_link_destinations_tx,
            relations: relations_tx,
        },
        EntityTypeReceiver {
            stream: select_all([
                schema_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Schema)
                    .boxed(),
                inherits_from_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        EntityTypeRowBatch::InheritsFrom(values.into_iter().flatten().collect())
                    })
                    .boxed(),
                constrains_properties_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        EntityTypeRowBatch::ConstrainsProperties(
                            values.into_iter().flatten().collect(),
                        )
                    })
                    .boxed(),
                constrains_links_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        EntityTypeRowBatch::ConstrainsLinks(values.into_iter().flatten().collect())
                    })
                    .boxed(),
                constrains_link_destinations_rx
                    .ready_chunks(chunk_size)
                    .map(|values| {
                        EntityTypeRowBatch::ConstrainsLinkDestinations(
                            values.into_iter().flatten().collect(),
                        )
                    })
                    .boxed(),
                relations_rx
                    .ready_chunks(chunk_size)
                    .map(EntityTypeRowBatch::Relations)
                    .boxed(),
            ]),
        },
    )
}
