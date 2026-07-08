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
    principal::{actor::ActorEntityUuid, actor_group::WebId},
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

/// The parameter array a [`PostgresRow`] produced for a single column, remembering its
/// element count.
///
/// The count lets the bulk-insert compilation verify that every column received one element
/// per row — `unnest` would silently NULL-pad a shorter array and extend the insert for a
/// longer one.
#[derive(Debug)]
pub struct ColumnParameters<'rows> {
    len: usize,
    values: Box<dyn ToSql + Send + Sync + 'rows>,
}

impl<'rows, T> From<Vec<T>> for ColumnParameters<'rows>
where
    T: ToSql + Send + Sync + 'rows,
{
    fn from(values: Vec<T>) -> Self {
        Self {
            len: values.len(),
            values: Box::new(values),
        }
    }
}

impl<'rows> ColumnParameters<'rows> {
    #[must_use]
    pub const fn len(&self) -> usize {
        self.len
    }

    #[must_use]
    pub const fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Unwraps the parameter array for statement execution.
    #[must_use]
    pub fn into_values(self) -> Box<dyn ToSql + Send + Sync + 'rows> {
        self.values
    }
}

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
    type Column: DatabaseColumn<'static> + 'static;

    /// The table this row is inserted into.
    fn table() -> TableName<'static>;

    /// Transposes `rows` into one array parameter per column.
    ///
    /// # Implementation Note
    ///
    /// A careless implementation silently corrupts the inserted data. Implementations
    /// destructure `Self` exhaustively so a new field is a compile error until it is
    /// handled here. Pairing each array with its column keeps the generated statement and
    /// the parameters aligned, but nothing checks that a value lands in the right column's
    /// array. The element counts captured in [`ColumnParameters`] are verified against the
    /// row count when the statement is compiled (debug builds), catching a missed or
    /// doubled push.
    fn columnar_parameters(rows: &[Self]) -> Vec<(Self::Column, ColumnParameters<'_>)>;
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(DataTypeEmbeddings, ColumnParameters<'_>)> {
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
            (DataTypeEmbeddings::OntologyId, ontology_ids.into()),
            (DataTypeEmbeddings::Embedding, embeddings.into()),
            (
                DataTypeEmbeddings::UpdatedAtTransactionTime,
                updated_at_transaction_times.into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(DataTypeConversions, ColumnParameters<'_>)> {
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
                source_data_type_ontology_ids.into(),
            ),
            (
                DataTypeConversions::TargetDataTypeBaseUrl,
                target_data_type_base_urls.into(),
            ),
            (DataTypeConversions::From, froms.into()),
            (DataTypeConversions::Into, intos.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(DataTypes, ColumnParameters<'_>)> {
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
            (DataTypes::OntologyId, ontology_ids.into()),
            (DataTypes::Schema, schemas.into()),
            (DataTypes::ClosedSchema, closed_schemas.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityDrafts, ColumnParameters<'_>)> {
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
            (EntityDrafts::WebId, web_ids.into()),
            (EntityDrafts::EntityUuid, entity_uuids.into()),
            (EntityDrafts::DraftId, draft_ids.into()),
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
    pub created_by_id: ActorEntityUuid,
}

impl PostgresRow for EntityEditionRow {
    type Column = EntityEditions;

    fn table() -> TableName<'static> {
        Table::EntityEditions.into()
    }

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityEditions, ColumnParameters<'_>)> {
        let mut entity_edition_ids = Vec::with_capacity(rows.len());
        let mut properties = Vec::with_capacity(rows.len());
        let mut archiveds = Vec::with_capacity(rows.len());
        let mut confidences = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        let mut property_metadatas = Vec::with_capacity(rows.len());
        let mut created_by_ids = Vec::with_capacity(rows.len());
        for Self {
            entity_edition_id,
            properties: row_properties,
            archived,
            confidence,
            provenance,
            property_metadata,
            created_by_id,
        } in rows
        {
            entity_edition_ids.push(entity_edition_id);
            properties.push(row_properties);
            archiveds.push(archived);
            confidences.push(confidence);
            provenances.push(provenance);
            property_metadatas.push(property_metadata);
            created_by_ids.push(created_by_id);
        }
        vec![
            (EntityEditions::EditionId, entity_edition_ids.into()),
            (EntityEditions::Properties, properties.into()),
            (EntityEditions::Archived, archiveds.into()),
            (EntityEditions::Confidence, confidences.into()),
            (EntityEditions::Provenance, provenances.into()),
            (EntityEditions::PropertyMetadata, property_metadatas.into()),
            (EntityEditions::CreatedById, created_by_ids.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityEmbeddings, ColumnParameters<'_>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut draft_ids = Vec::with_capacity(rows.len());
        let mut properties = Vec::with_capacity(rows.len());
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
            properties.push(property);
            embeddings.push(embedding);
            updated_at_transaction_times.push(updated_at_transaction_time);
            updated_at_decision_times.push(updated_at_decision_time);
        }
        vec![
            (EntityEmbeddings::WebId, web_ids.into()),
            (EntityEmbeddings::EntityUuid, entity_uuids.into()),
            (EntityEmbeddings::DraftId, draft_ids.into()),
            (EntityEmbeddings::Property, properties.into()),
            (EntityEmbeddings::Embedding, embeddings.into()),
            (
                EntityEmbeddings::UpdatedAtTransactionTime,
                updated_at_transaction_times.into(),
            ),
            (
                EntityEmbeddings::UpdatedAtDecisionTime,
                updated_at_decision_times.into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityEdge, ColumnParameters<'_>)> {
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
            (EntityEdge::SourceWebId, source_web_ids.into()),
            (EntityEdge::SourceEntityUuid, source_entity_uuids.into()),
            (EntityEdge::TargetWebId, target_web_ids.into()),
            (EntityEdge::TargetEntityUuid, target_entity_uuids.into()),
            (EntityEdge::Confidence, confidences.into()),
            (EntityEdge::Provenance, provenances.into()),
            (EntityEdge::Kind, kinds.into()),
            (EntityEdge::Direction, directions.into()),
        ]
    }
}

#[derive(Debug)]
pub struct EntityIdRow {
    pub web_id: WebId,
    pub entity_uuid: EntityUuid,
    pub provenance: InferredEntityProvenance,
    pub read_only: bool,
    pub created_by_id: ActorEntityUuid,
    pub created_at_transaction_time: Timestamp<TransactionTime>,
    pub created_at_decision_time: Timestamp<DecisionTime>,
}

impl PostgresRow for EntityIdRow {
    type Column = EntityIds;

    fn table() -> TableName<'static> {
        Table::EntityIds.into()
    }

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityIds, ColumnParameters<'_>)> {
        let mut web_ids = Vec::with_capacity(rows.len());
        let mut entity_uuids = Vec::with_capacity(rows.len());
        let mut provenances = Vec::with_capacity(rows.len());
        let mut read_onlys = Vec::with_capacity(rows.len());
        let mut created_by_ids = Vec::with_capacity(rows.len());
        let mut created_at_transaction_times = Vec::with_capacity(rows.len());
        let mut created_at_decision_times = Vec::with_capacity(rows.len());
        for Self {
            web_id,
            entity_uuid,
            provenance,
            read_only,
            created_by_id,
            created_at_transaction_time,
            created_at_decision_time,
        } in rows
        {
            web_ids.push(web_id);
            entity_uuids.push(entity_uuid);
            provenances.push(provenance);
            read_onlys.push(read_only);
            created_by_ids.push(created_by_id);
            created_at_transaction_times.push(created_at_transaction_time);
            created_at_decision_times.push(created_at_decision_time);
        }
        vec![
            (EntityIds::WebId, web_ids.into()),
            (EntityIds::EntityUuid, entity_uuids.into()),
            (EntityIds::Provenance, provenances.into()),
            (EntityIds::ReadOnly, read_onlys.into()),
            (EntityIds::CreatedById, created_by_ids.into()),
            (
                EntityIds::CreatedAtTransactionTime,
                created_at_transaction_times.into(),
            ),
            (
                EntityIds::CreatedAtDecisionTime,
                created_at_decision_times.into(),
            ),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityIsOfType, ColumnParameters<'_>)> {
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
            (EntityIsOfType::EntityEditionId, entity_edition_ids.into()),
            (
                EntityIsOfType::EntityTypeOntologyId,
                entity_type_ontology_ids.into(),
            ),
            (EntityIsOfType::InheritanceDepth, inheritance_depths.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityTemporalMetadata, ColumnParameters<'_>)> {
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
            (EntityTemporalMetadata::WebId, web_ids.into()),
            (EntityTemporalMetadata::EntityUuid, entity_uuids.into()),
            (EntityTemporalMetadata::DraftId, draft_ids.into()),
            (EntityTemporalMetadata::EditionId, entity_edition_ids.into()),
            (EntityTemporalMetadata::DecisionTime, decision_times.into()),
            (
                EntityTemporalMetadata::TransactionTime,
                transaction_times.into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityTypeEmbeddings, ColumnParameters<'_>)> {
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
            (EntityTypeEmbeddings::OntologyId, ontology_ids.into()),
            (EntityTypeEmbeddings::Embedding, embeddings.into()),
            (
                EntityTypeEmbeddings::UpdatedAtTransactionTime,
                updated_at_transaction_times.into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(EntityTypes, ColumnParameters<'_>)> {
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
            (EntityTypes::OntologyId, ontology_ids.into()),
            (EntityTypes::Schema, schemas.into()),
            (EntityTypes::ClosedSchema, closed_schemas.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(OntologyIds, ColumnParameters<'_>)> {
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
            (OntologyIds::OntologyId, ontology_ids.into()),
            (OntologyIds::BaseUrl, base_urls.into()),
            (OntologyIds::Version, versions.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(OntologyOwnedMetadata, ColumnParameters<'_>)> {
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
            (OntologyOwnedMetadata::OntologyId, ontology_ids.into()),
            (OntologyOwnedMetadata::WebId, web_ids.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(OntologyExternalMetadata, ColumnParameters<'_>)> {
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
            (OntologyExternalMetadata::OntologyId, ontology_ids.into()),
            (OntologyExternalMetadata::FetchedAt, fetched_ats.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(OntologyTemporalMetadata, ColumnParameters<'_>)> {
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
            (OntologyTemporalMetadata::OntologyId, ontology_ids.into()),
            (
                OntologyTemporalMetadata::TransactionTime,
                transaction_times.into(),
            ),
            (OntologyTemporalMetadata::Provenance, provenances.into()),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(PropertyTypes, ColumnParameters<'_>)> {
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
            (PropertyTypes::OntologyId, ontology_ids.into()),
            (PropertyTypes::Schema, schemas.into()),
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

    fn columnar_parameters(
        rows: &[Self],
    ) -> Vec<(PropertyTypeConstrainsValuesOn, ColumnParameters<'_>)> {
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
                source_property_type_ontology_ids.into(),
            ),
            (
                PropertyTypeConstrainsValuesOn::TargetDataTypeOntologyId,
                target_data_type_ontology_ids.into(),
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

    fn columnar_parameters(rows: &[Self]) -> Vec<(PropertyTypeEmbeddings, ColumnParameters<'_>)> {
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
            (PropertyTypeEmbeddings::OntologyId, ontology_ids.into()),
            (PropertyTypeEmbeddings::Embedding, embeddings.into()),
            (
                PropertyTypeEmbeddings::UpdatedAtTransactionTime,
                updated_at_transaction_times.into(),
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

    fn columnar_parameters(
        rows: &[Self],
    ) -> Vec<(PropertyTypeConstrainsPropertiesOn, ColumnParameters<'_>)> {
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
                source_property_type_ontology_ids.into(),
            ),
            (
                PropertyTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                target_property_type_ontology_ids.into(),
            ),
        ]
    }
}
