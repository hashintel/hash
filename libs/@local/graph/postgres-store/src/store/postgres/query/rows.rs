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
    principal::actor_group::WebId,
};

use crate::store::postgres::query::{
    Table, TableName,
    table::{
        DataTypeConversions, DataTypeEmbeddings, DataTypes, DatabaseColumn, EntityDrafts,
        EntityEdge, EntityEditions, EntityEmbeddings, EntityIds, EntityIsOfType,
        EntityTemporalMetadata, EntityTypeEmbeddings, EntityTypes, OntologyExternalMetadata,
        OntologyIds, OntologyOwnedMetadata, OntologyTemporalMetadata,
        PropertyTypeConstrainsPropertiesOn, PropertyTypeConstrainsValuesOn, PropertyTypeEmbeddings,
        PropertyTypes, ReferenceTable,
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
pub trait PostgresRow: Sized {
    /// The column type of the table this row is inserted into.
    type Column: DatabaseColumn + 'static;

    /// The table this row is inserted into.
    fn table() -> TableName<'static>;

    /// Transposes `rows` into one array parameter per column.
    ///
    /// Implementations destructure `Self` exhaustively so a new field is a compile error
    /// until it is handled here. Pairing each array with its column keeps the generated
    /// statement and the parameters aligned, but nothing checks that a value lands in the
    /// right column's array. Every array must contain one element per row: `unnest` pads
    /// shorter arrays with NULLs instead of failing.
    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(Self::Column, Box<dyn ToSql + Send + Sync + 'r>)>;
}

#[derive(Debug)]
pub struct DataTypeEmbeddingRow<'e> {
    pub ontology_id: DataTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

impl PostgresRow for DataTypeEmbeddingRow<'_> {
    type Column = DataTypeEmbeddings;

    fn table() -> TableName<'static> {
        Table::DataTypeEmbeddings.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(DataTypeEmbeddings, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut embeddings = Vec::with_capacity(rows.len());
        let mut updated_at_transaction_times = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            embedding,
            updated_at_transaction_time,
        } in rows
        {
            ontology_ids.push(ontology_id);
            embeddings.push(embedding);
            updated_at_transaction_times.push(updated_at_transaction_time);
        }
        vec![
            (DataTypeEmbeddings::OntologyId, Box::new(ontology_ids)),
            (DataTypeEmbeddings::Embedding, Box::new(embeddings)),
            (
                DataTypeEmbeddings::UpdatedAtTransactionTime,
                Box::new(updated_at_transaction_times),
            ),
        ]
    }
}

#[derive(Debug)]
pub struct DataTypeConversionsRow {
    pub source_data_type_ontology_id: DataTypeUuid,
    pub target_data_type_base_url: BaseUrl,
    pub from: ConversionDefinition,
    pub into: ConversionDefinition,
}

impl PostgresRow for DataTypeConversionsRow {
    type Column = DataTypeConversions;

    fn table() -> TableName<'static> {
        Table::DataTypeConversions.into()
    }

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

#[derive(Debug)]
pub struct DataTypeRow {
    pub ontology_id: DataTypeUuid,
    pub schema: Valid<DataType>,
    pub closed_schema: Valid<ClosedDataType>,
}

impl PostgresRow for DataTypeRow {
    type Column = DataTypes;

    fn table() -> TableName<'static> {
        Table::DataTypes.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(DataTypes, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut schemas = Vec::with_capacity(rows.len());
        let mut closed_schemas = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            schema,
            closed_schema,
        } in rows
        {
            ontology_ids.push(ontology_id);
            schemas.push(schema);
            closed_schemas.push(closed_schema);
        }
        vec![
            (DataTypes::OntologyId, Box::new(ontology_ids)),
            (DataTypes::Schema, Box::new(schemas)),
            (DataTypes::ClosedSchema, Box::new(closed_schemas)),
        ]
    }
}

#[derive(Debug)]
pub struct EntityDraftRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: DraftId,
}

impl PostgresRow for EntityDraftRow {
    type Column = EntityDrafts;

    fn table() -> TableName<'static> {
        Table::EntityDrafts.into()
    }

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

#[derive(Debug)]
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

    fn table() -> TableName<'static> {
        Table::EntityEditions.into()
    }

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

#[derive(Debug)]
pub struct EntityEmbeddingRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub draft_id: Option<DraftId>,
    pub property: Option<String>,
    pub embedding: Embedding<'static>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
    pub updated_at_decision_time: Timestamp<DecisionTime>,
}

impl PostgresRow for EntityEmbeddingRow {
    type Column = EntityEmbeddings;

    fn table() -> TableName<'static> {
        Table::EntityEmbeddings.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityEmbeddings, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut draft_ids = Vec::with_capacity(rows.len());
        let mut propertys = Vec::with_capacity(rows.len());
        let mut embeddings = Vec::with_capacity(rows.len());
        let mut updated_at_transaction_times = Vec::with_capacity(rows.len());
        let mut updated_at_decision_times = Vec::with_capacity(rows.len());
        for Self {
            web_id,
            entity_uuid,
            draft_id,
            property,
            embedding,
            updated_at_transaction_time,
            updated_at_decision_time,
        } in rows
        {
            web_ids.push(web_id);
            entity_uuids.push(entity_uuid);
            draft_ids.push(draft_id);
            propertys.push(property);
            embeddings.push(embedding);
            updated_at_transaction_times.push(updated_at_transaction_time);
            updated_at_decision_times.push(updated_at_decision_time);
        }
        vec![
            (EntityEmbeddings::WebId, Box::new(web_ids)),
            (EntityEmbeddings::EntityUuid, Box::new(entity_uuids)),
            (EntityEmbeddings::DraftId, Box::new(draft_ids)),
            (EntityEmbeddings::Property, Box::new(propertys)),
            (EntityEmbeddings::Embedding, Box::new(embeddings)),
            (
                EntityEmbeddings::UpdatedAtTransactionTime,
                Box::new(updated_at_transaction_times),
            ),
            (
                EntityEmbeddings::UpdatedAtDecisionTime,
                Box::new(updated_at_decision_times),
            ),
        ]
    }
}

#[derive(Debug)]
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

    fn table() -> TableName<'static> {
        Table::EntityEdge.into()
    }

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

#[derive(Debug)]
pub struct EntityIdRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub provenance: InferredEntityProvenance,
    pub read_only: bool,
}

impl PostgresRow for EntityIdRow {
    type Column = EntityIds;

    fn table() -> TableName<'static> {
        Table::EntityIds.into()
    }

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

#[derive(Debug)]
pub struct EntityIsOfTypeRow {
    pub entity_edition_id: EntityEditionId,
    pub entity_type_ontology_id: EntityTypeUuid,
    pub inheritance_depth: InheritanceDepth,
}

impl PostgresRow for EntityIsOfTypeRow {
    type Column = EntityIsOfType;

    fn table() -> TableName<'static> {
        Table::EntityIsOfType.into()
    }

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

#[derive(Debug)]
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

    fn table() -> TableName<'static> {
        Table::EntityTemporalMetadata.into()
    }

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

#[derive(Debug)]
pub struct EntityTypeEmbeddingRow<'e> {
    pub ontology_id: EntityTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

impl PostgresRow for EntityTypeEmbeddingRow<'_> {
    type Column = EntityTypeEmbeddings;

    fn table() -> TableName<'static> {
        Table::EntityTypeEmbeddings.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityTypeEmbeddings, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut embeddings = Vec::with_capacity(rows.len());
        let mut updated_at_transaction_times = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            embedding,
            updated_at_transaction_time,
        } in rows
        {
            ontology_ids.push(ontology_id);
            embeddings.push(embedding);
            updated_at_transaction_times.push(updated_at_transaction_time);
        }
        vec![
            (EntityTypeEmbeddings::OntologyId, Box::new(ontology_ids)),
            (EntityTypeEmbeddings::Embedding, Box::new(embeddings)),
            (
                EntityTypeEmbeddings::UpdatedAtTransactionTime,
                Box::new(updated_at_transaction_times),
            ),
        ]
    }
}

#[derive(Debug)]
pub struct EntityTypeRow {
    pub ontology_id: EntityTypeUuid,
    pub schema: Valid<EntityType>,
    pub closed_schema: Valid<ClosedEntityType>,
}

impl PostgresRow for EntityTypeRow {
    type Column = EntityTypes;

    fn table() -> TableName<'static> {
        Table::EntityTypes.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(EntityTypes, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut schemas = Vec::with_capacity(rows.len());
        let mut closed_schemas = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            schema,
            closed_schema,
        } in rows
        {
            ontology_ids.push(ontology_id);
            schemas.push(schema);
            closed_schemas.push(closed_schema);
        }
        vec![
            (EntityTypes::OntologyId, Box::new(ontology_ids)),
            (EntityTypes::Schema, Box::new(schemas)),
            (EntityTypes::ClosedSchema, Box::new(closed_schemas)),
        ]
    }
}

#[derive(Debug)]
pub struct OntologyIdRow {
    pub ontology_id: OntologyTypeUuid,
    pub base_url: BaseUrl,
    pub version: OntologyTypeVersion,
}

impl PostgresRow for OntologyIdRow {
    type Column = OntologyIds;

    fn table() -> TableName<'static> {
        Table::OntologyIds.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(OntologyIds, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut base_urls = Vec::with_capacity(rows.len());
        let mut versions = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            base_url,
            version,
        } in rows
        {
            ontology_ids.push(ontology_id);
            base_urls.push(base_url);
            versions.push(version);
        }
        vec![
            (OntologyIds::OntologyId, Box::new(ontology_ids)),
            (OntologyIds::BaseUrl, Box::new(base_urls)),
            (OntologyIds::Version, Box::new(versions)),
        ]
    }
}

#[derive(Debug)]
pub struct OntologyOwnedMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub web_id: WebId,
}

impl PostgresRow for OntologyOwnedMetadataRow {
    type Column = OntologyOwnedMetadata;

    fn table() -> TableName<'static> {
        Table::OntologyOwnedMetadata.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(OntologyOwnedMetadata, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut web_ids = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            web_id,
        } in rows
        {
            ontology_ids.push(ontology_id);
            web_ids.push(web_id);
        }
        vec![
            (OntologyOwnedMetadata::OntologyId, Box::new(ontology_ids)),
            (OntologyOwnedMetadata::WebId, Box::new(web_ids)),
        ]
    }
}

#[derive(Debug)]
pub struct OntologyExternalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub fetched_at: OffsetDateTime,
}

impl PostgresRow for OntologyExternalMetadataRow {
    type Column = OntologyExternalMetadata;

    fn table() -> TableName<'static> {
        Table::OntologyExternalMetadata.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(OntologyExternalMetadata, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut fetched_ats = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            fetched_at,
        } in rows
        {
            ontology_ids.push(ontology_id);
            fetched_ats.push(fetched_at);
        }
        vec![
            (OntologyExternalMetadata::OntologyId, Box::new(ontology_ids)),
            (OntologyExternalMetadata::FetchedAt, Box::new(fetched_ats)),
        ]
    }
}

#[derive(Debug)]
pub struct OntologyTemporalMetadataRow {
    pub ontology_id: OntologyTypeUuid,
    pub transaction_time: LeftClosedTemporalInterval<TransactionTime>,
    pub provenance: OntologyEditionProvenance,
}

impl PostgresRow for OntologyTemporalMetadataRow {
    type Column = OntologyTemporalMetadata;

    fn table() -> TableName<'static> {
        Table::OntologyTemporalMetadata.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(OntologyTemporalMetadata, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut transaction_times = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            transaction_time,
            provenance,
        } in rows
        {
            ontology_ids.push(ontology_id);
            transaction_times.push(transaction_time);
            provenances.push(provenance);
        }
        vec![
            (OntologyTemporalMetadata::OntologyId, Box::new(ontology_ids)),
            (
                OntologyTemporalMetadata::TransactionTime,
                Box::new(transaction_times),
            ),
            (OntologyTemporalMetadata::Provenance, Box::new(provenances)),
        ]
    }
}

#[derive(Debug)]
pub struct PropertyTypeRow {
    pub ontology_id: PropertyTypeUuid,
    pub schema: Valid<PropertyType>,
}

impl PostgresRow for PropertyTypeRow {
    type Column = PropertyTypes;

    fn table() -> TableName<'static> {
        Table::PropertyTypes.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(PropertyTypes, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut schemas = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            schema,
        } in rows
        {
            ontology_ids.push(ontology_id);
            schemas.push(schema);
        }
        vec![
            (PropertyTypes::OntologyId, Box::new(ontology_ids)),
            (PropertyTypes::Schema, Box::new(schemas)),
        ]
    }
}

#[derive(Debug)]
pub struct PropertyTypeConstrainsValuesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_data_type_ontology_id: DataTypeUuid,
}

impl PostgresRow for PropertyTypeConstrainsValuesOnRow {
    type Column = PropertyTypeConstrainsValuesOn;

    fn table() -> TableName<'static> {
        Table::Reference(ReferenceTable::PropertyTypeConstrainsValuesOn).into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(
        PropertyTypeConstrainsValuesOn,
        Box<dyn ToSql + Send + Sync + 'r>,
    )> {
        let mut source_property_type_ontology_ids = Vec::with_capacity(rows.len());
        let mut target_data_type_ontology_ids = Vec::with_capacity(rows.len());
        for Self {
            source_property_type_ontology_id,
            target_data_type_ontology_id,
        } in rows
        {
            source_property_type_ontology_ids.push(source_property_type_ontology_id);
            target_data_type_ontology_ids.push(target_data_type_ontology_id);
        }
        vec![
            (
                PropertyTypeConstrainsValuesOn::SourcePropertyTypeOntologyId,
                Box::new(source_property_type_ontology_ids),
            ),
            (
                PropertyTypeConstrainsValuesOn::TargetDataTypeOntologyId,
                Box::new(target_data_type_ontology_ids),
            ),
        ]
    }
}

#[derive(Debug)]
pub struct PropertyTypeEmbeddingRow<'e> {
    pub ontology_id: PropertyTypeUuid,
    pub embedding: Embedding<'e>,
    pub updated_at_transaction_time: Timestamp<TransactionTime>,
}

impl PostgresRow for PropertyTypeEmbeddingRow<'_> {
    type Column = PropertyTypeEmbeddings;

    fn table() -> TableName<'static> {
        Table::PropertyTypeEmbeddings.into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(PropertyTypeEmbeddings, Box<dyn ToSql + Send + Sync + 'r>)> {
        let mut ontology_ids = Vec::with_capacity(rows.len());
        let mut embeddings = Vec::with_capacity(rows.len());
        let mut updated_at_transaction_times = Vec::with_capacity(rows.len());
        for Self {
            ontology_id,
            embedding,
            updated_at_transaction_time,
        } in rows
        {
            ontology_ids.push(ontology_id);
            embeddings.push(embedding);
            updated_at_transaction_times.push(updated_at_transaction_time);
        }
        vec![
            (PropertyTypeEmbeddings::OntologyId, Box::new(ontology_ids)),
            (PropertyTypeEmbeddings::Embedding, Box::new(embeddings)),
            (
                PropertyTypeEmbeddings::UpdatedAtTransactionTime,
                Box::new(updated_at_transaction_times),
            ),
        ]
    }
}

#[derive(Debug)]
pub struct PropertyTypeConstrainsPropertiesOnRow {
    pub source_property_type_ontology_id: PropertyTypeUuid,
    pub target_property_type_ontology_id: PropertyTypeUuid,
}

impl PostgresRow for PropertyTypeConstrainsPropertiesOnRow {
    type Column = PropertyTypeConstrainsPropertiesOn;

    fn table() -> TableName<'static> {
        Table::Reference(ReferenceTable::PropertyTypeConstrainsPropertiesOn).into()
    }

    fn columnar_parameters<'r>(
        rows: &'r [Self],
    ) -> Vec<(
        PropertyTypeConstrainsPropertiesOn,
        Box<dyn ToSql + Send + Sync + 'r>,
    )> {
        let mut source_property_type_ontology_ids = Vec::with_capacity(rows.len());
        let mut target_property_type_ontology_ids = Vec::with_capacity(rows.len());
        for Self {
            source_property_type_ontology_id,
            target_property_type_ontology_id,
        } in rows
        {
            source_property_type_ontology_ids.push(source_property_type_ontology_id);
            target_property_type_ontology_ids.push(target_property_type_ontology_id);
        }
        vec![
            (
                PropertyTypeConstrainsPropertiesOn::SourcePropertyTypeOntologyId,
                Box::new(source_property_type_ontology_ids),
            ),
            (
                PropertyTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                Box::new(target_property_type_ontology_ids),
            ),
        ]
    }
}
