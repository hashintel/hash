use hash_graph_store::subgraph::edges::{EdgeDirection, EntityTraversalEdgeKind};
use hash_graph_temporal_versioning::{
    DecisionTime, LeftClosedTemporalInterval, Timestamp, TransactionTime,
};
use hash_graph_types::Embedding;
use postgres_types::ToSql;
use time::OffsetDateTime;
use type_system::{
    Valid,
    knowledge::{
        Confidence,
        entity::{
            id::{DraftId, EntityEditionId, EntityUuid},
            provenance::{EntityEditionProvenance, InferredEntityProvenance},
        },
        property::{
            PropertyObject,
            metadata::{PropertyObjectMetadata, PropertyProvenance},
        },
    },
    ontology::{
        InheritanceDepth,
        data_type::{ClosedDataType, ConversionDefinition, DataType, DataTypeUuid},
        entity_type::{ClosedEntityType, EntityType, EntityTypeUuid},
        id::{BaseUrl, OntologyTypeUuid, OntologyTypeVersion},
        property_type::{PropertyType, PropertyTypeUuid},
        provenance::OntologyEditionProvenance,
    },
    principal::actor_group::{ActorGroupEntityUuid, WebId},
};

use crate::store::postgres::query::{
    Table,
    table::{
        DataTypeConversions, EntityDrafts, EntityEdge, EntityEditions, EntityIds, EntityIsOfType,
        EntityTemporalMetadata, InsertableColumn,
    },
};

/// A Rust mirror of a database table used for `unnest`-based bulk inserts.
///
/// Inserts built from this trait send one array parameter per column instead of an array of
/// the table's composite row type, and name every inserted column explicitly. This keeps a
/// binary compiled against an older schema working while a migration adds a nullable or
/// defaulted column: the new column is simply absent from the statement. Composite row types
/// break in that window because their wire encoding must match the table's current column
/// count.
///
/// The composite [`ToSql`] derives on implementors are still required by the snapshot
/// restore path.
pub trait PostgresRow: Sized {
    /// The column type of the table this row is inserted into.
    type Column: InsertableColumn + 'static;

    /// The table this row is inserted into.
    const TABLE: Table;

    /// Transposes `rows` into one array parameter per column.
    ///
    /// Implementations destructure `Self` exhaustively so a new field is a compile error
    /// until it is handled here. Pairing each array with its column keeps the generated
    /// statement and the parameters aligned, but nothing checks that a value lands in the
    /// right column's array.
    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(Self::Column, Box<dyn ToSql + Send + Sync + 'r>)>;
}

#[derive(Debug, ToSql)]
#[postgres(name = "account_groups")]
pub struct AccountGroupRow {
    pub account_group_id: ActorGroupEntityUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "accounts")]
pub struct AccountRow {
    pub account_id: EntityUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "base_urls")]
pub struct BaseUrlRow {
    pub base_url: BaseUrl,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_type_embeddings")]
pub struct DataTypeEmbeddingRow<'e> {
    pub ontology_id: DataTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_type_conversions")]
pub struct DataTypeConversionsRow {
    pub source_data_type_ontology_id: DataTypeUuid,
    pub target_data_type_base_url: BaseUrl,
    pub from: ConversionDefinition,
    pub into: ConversionDefinition,
}

impl PostgresRow for DataTypeConversionsRow {
    type Column = DataTypeConversions;

    const TABLE: Table = Table::DataTypeConversions;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(DataTypeConversions, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut source_data_type_ontology_ids = Vec::with_capacity(rows.len());
        let mut target_data_type_base_urls = Vec::with_capacity(rows.len());
        let mut froms = Vec::with_capacity(rows.len());
        let mut intos = Vec::with_capacity(rows.len());
        for Self {
            source_data_type_ontology_id,
            target_data_type_base_url,
            from,
            into,
        } in rows
        {
            source_data_type_ontology_ids.push(source_data_type_ontology_id);
            target_data_type_base_urls.push(target_data_type_base_url);
            froms.push(from);
            intos.push(into);
        }
        vec![
            (
                DataTypeConversions::SourceDataTypeOntologyId,
                Box::new(source_data_type_ontology_ids),
            ),
            (
                DataTypeConversions::TargetDataTypeBaseUrl,
                Box::new(target_data_type_base_urls),
            ),
            (DataTypeConversions::From, Box::new(froms)),
            (DataTypeConversions::Into, Box::new(intos)),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "data_types")]
pub struct DataTypeRow {
    pub ontology_id: DataTypeUuid,
    pub schema: Valid<DataType>,
    pub closed_schema: Valid<ClosedDataType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_drafts")]
pub struct EntityDraftRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: DraftId,
}

impl PostgresRow for EntityDraftRow {
    type Column = EntityDrafts;

    const TABLE: Table = Table::EntityDrafts;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityDrafts, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut draft_ids = Vec::with_capacity(rows.len());
        for Self {
            web_id,
            entity_uuid,
            draft_id,
        } in rows
        {
            web_ids.push(web_id);
            entity_uuids.push(entity_uuid);
            draft_ids.push(draft_id);
        }
        vec![
            (EntityDrafts::WebId, Box::new(web_ids)),
            (EntityDrafts::EntityUuid, Box::new(entity_uuids)),
            (EntityDrafts::DraftId, Box::new(draft_ids)),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_editions")]
pub struct EntityEditionRow {
    pub entity_edition_id: EntityEditionId,
    pub properties: PropertyObject,
    pub archived: bool,
    pub confidence: Option<Confidence>,
    pub provenance: EntityEditionProvenance,
    pub property_metadata: PropertyObjectMetadata,
}

impl PostgresRow for EntityEditionRow {
    type Column = EntityEditions;

    const TABLE: Table = Table::EntityEditions;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityEditions, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut entity_edition_ids = Vec::with_capacity(rows.len());
        let mut properties = Vec::with_capacity(rows.len());
        let mut archiveds = Vec::with_capacity(rows.len());
        let mut confidences = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        let mut property_metadatas = Vec::with_capacity(rows.len());
        for Self {
            entity_edition_id,
            properties: row_properties,
            archived,
            confidence,
            provenance,
            property_metadata,
        } in rows
        {
            entity_edition_ids.push(entity_edition_id);
            properties.push(row_properties);
            archiveds.push(archived);
            confidences.push(confidence);
            provenances.push(provenance);
            property_metadatas.push(property_metadata);
        }
        vec![
            (EntityEditions::EditionId, Box::new(entity_edition_ids)),
            (EntityEditions::Properties, Box::new(properties)),
            (EntityEditions::Archived, Box::new(archiveds)),
            (EntityEditions::Confidence, Box::new(confidences)),
            (EntityEditions::Provenance, Box::new(provenances)),
            (
                EntityEditions::PropertyMetadata,
                Box::new(property_metadatas),
            ),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_embeddings")]
pub struct EntityEmbeddingRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
    pub property: Option<String>,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_edge")]
pub struct EntityEdgeRow {
    pub source_web_id: WebId,
    pub source_entity_uuid: EntityUuid,
    pub target_web_id: WebId,
    pub target_entity_uuid: EntityUuid,
    pub confidence: Option<Confidence>,
    pub provenance: PropertyProvenance,
    pub kind: EntityTraversalEdgeKind,
    pub direction: EdgeDirection,
}

impl PostgresRow for EntityEdgeRow {
    type Column = EntityEdge;

    const TABLE: Table = Table::EntityEdge;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityEdge, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut source_web_ids = Vec::with_capacity(rows.len());
        let mut source_entity_uuids = Vec::with_capacity(rows.len());
        let mut target_web_ids = Vec::with_capacity(rows.len());
        let mut target_entity_uuids = Vec::with_capacity(rows.len());
        let mut confidences = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        let mut kinds = Vec::with_capacity(rows.len());
        let mut directions = Vec::with_capacity(rows.len());
        for Self {
            source_web_id,
            source_entity_uuid,
            target_web_id,
            target_entity_uuid,
            confidence,
            provenance,
            kind,
            direction,
        } in rows
        {
            source_web_ids.push(source_web_id);
            source_entity_uuids.push(source_entity_uuid);
            target_web_ids.push(target_web_id);
            target_entity_uuids.push(target_entity_uuid);
            confidences.push(confidence);
            provenances.push(provenance);
            kinds.push(kind);
            directions.push(direction);
        }
        vec![
            (EntityEdge::SourceWebId, Box::new(source_web_ids)),
            (EntityEdge::SourceEntityUuid, Box::new(source_entity_uuids)),
            (EntityEdge::TargetWebId, Box::new(target_web_ids)),
            (EntityEdge::TargetEntityUuid, Box::new(target_entity_uuids)),
            (EntityEdge::Confidence, Box::new(confidences)),
            (EntityEdge::Provenance, Box::new(provenances)),
            (EntityEdge::Kind, Box::new(kinds)),
            (EntityEdge::Direction, Box::new(directions)),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_ids")]
pub struct EntityIdRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub provenance: InferredEntityProvenance,
    pub read_only: bool,
}

impl PostgresRow for EntityIdRow {
    type Column = EntityIds;

    const TABLE: Table = Table::EntityIds;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityIds, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        let mut read_onlys = Vec::with_capacity(rows.len());
        for Self {
            web_id,
            entity_uuid,
            provenance,
            read_only,
        } in rows
        {
            web_ids.push(web_id);
            entity_uuids.push(entity_uuid);
            provenances.push(provenance);
            read_onlys.push(read_only);
        }
        vec![
            (EntityIds::WebId, Box::new(web_ids)),
            (EntityIds::EntityUuid, Box::new(entity_uuids)),
            (EntityIds::Provenance, Box::new(provenances)),
            (EntityIds::ReadOnly, Box::new(read_onlys)),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_is_of_type")]
pub struct EntityIsOfTypeRow {
    pub entity_edition_id: EntityEditionId,
    pub entity_type_ontology_id: EntityTypeUuid,
    pub inheritance_depth: InheritanceDepth,
}

impl PostgresRow for EntityIsOfTypeRow {
    type Column = EntityIsOfType;

    const TABLE: Table = Table::EntityIsOfType;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityIsOfType, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut entity_edition_ids = Vec::with_capacity(rows.len());
        let mut entity_type_ontology_ids = Vec::with_capacity(rows.len());
        let mut inheritance_depths = Vec::with_capacity(rows.len());
        for Self {
            entity_edition_id,
            entity_type_ontology_id,
            inheritance_depth,
        } in rows
        {
            entity_edition_ids.push(entity_edition_id);
            entity_type_ontology_ids.push(entity_type_ontology_id);
            inheritance_depths.push(inheritance_depth);
        }
        vec![
            (
                EntityIsOfType::EntityEditionId,
                Box::new(entity_edition_ids),
            ),
            (
                EntityIsOfType::EntityTypeOntologyId,
                Box::new(entity_type_ontology_ids),
            ),
            (
                EntityIsOfType::InheritanceDepth,
                Box::new(inheritance_depths),
            ),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_temporal_metadata")]
pub struct EntityTemporalMetadataRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
    pub entity_edition_id: EntityEditionId,
    pub decision_time: LeftClosedTemporalInterval<DecisionTime>,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
}

impl PostgresRow for EntityTemporalMetadataRow {
    type Column = EntityTemporalMetadata;

    const TABLE: Table = Table::EntityTemporalMetadata;

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityTemporalMetadata, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut draft_ids = Vec::with_capacity(rows.len());
        let mut entity_edition_ids = Vec::with_capacity(rows.len());
        let mut decision_times = Vec::with_capacity(rows.len());
        let mut transaction_times = Vec::with_capacity(rows.len());
        for Self {
            web_id,
            entity_uuid,
            draft_id,
            entity_edition_id,
            decision_time,
            transaction_time,
        } in rows
        {
            web_ids.push(web_id);
            entity_uuids.push(entity_uuid);
            draft_ids.push(draft_id);
            entity_edition_ids.push(entity_edition_id);
            decision_times.push(decision_time);
            transaction_times.push(transaction_time);
        }
        vec![
            (EntityTemporalMetadata::WebId, Box::new(web_ids)),
            (EntityTemporalMetadata::EntityUuid, Box::new(entity_uuids)),
            (EntityTemporalMetadata::DraftId, Box::new(draft_ids)),
            (
                EntityTemporalMetadata::EditionId,
                Box::new(entity_edition_ids),
            ),
            (
                EntityTemporalMetadata::DecisionTime,
                Box::new(decision_times),
            ),
            (
                EntityTemporalMetadata::TransactionTime,
                Box::new(transaction_times),
            ),
        ]
    }
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_link_destinations_on")]
pub struct EntityTypeConstrainsLinkDestinationsOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_links_on")]
pub struct EntityTypeConstrainsLinksOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_constrains_properties_on")]
pub struct EntityTypeConstrainsPropertiesOnRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_property_type_ontology_id: PropertyTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_embeddings")]
pub struct EntityTypeEmbeddingRow<'e> {
    pub ontology_id: EntityTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_type_inherits_from")]
pub struct EntityTypeInheritsFromRow {
    pub source_entity_type_ontology_id: EntityTypeUuid,
    pub target_entity_type_ontology_id: EntityTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "entity_types")]
pub struct EntityTypeRow {
    pub ontology_id: EntityTypeUuid,
    pub schema: Valid<EntityType>,
    pub closed_schema: Valid<ClosedEntityType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_ids")]
pub struct OntologyIdRow {
    pub ontology_id: OntologyTypeUuid,
    pub base_url: BaseUrl,
    pub version: OntologyTypeVersion,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_owned_metadata")]
pub struct OntologyOwnedMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub web_id: WebId,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_external_metadata")]
pub struct OntologyExternalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub fetched_at: OffsetDateTime,
}

#[derive(Debug, ToSql)]
#[postgres(name = "ontology_temporal_metadata")]
pub struct OntologyTemporalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub provenance: OntologyEditionProvenance,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_types")]
pub struct PropertyTypeRow {
    pub ontology_id: PropertyTypeUuid,
    pub schema: Valid<PropertyType>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_values_on")]
pub struct PropertyTypeConstrainsValuesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_data_type_ontology_id: DataTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_embeddings")]
pub struct PropertyTypeEmbeddingRow<'e> {
    pub ontology_id: PropertyTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

#[derive(Debug, ToSql)]
#[postgres(name = "property_type_constrains_properties_on")]
pub struct PropertyTypeConstrainsPropertiesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_property_type_ontology_id: PropertyTypeUuid,
}

#[derive(Debug, ToSql)]
#[postgres(name = "webs")]
pub struct WebRow {
    pub web_id: WebId,
}
