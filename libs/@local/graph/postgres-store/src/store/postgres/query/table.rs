use core::{
    fmt::{self, Debug, Formatter},
    hash::Hash,
    iter::{Chain, Once, once},
};

use hash_graph_store::{
    filter::{JsonPath, ParameterType},
    subgraph::edges::EdgeDirection,
};
use hash_graph_temporal_versioning::TimeAxis;
use postgres_types::ToSql;

use super::expression::{ColumnName, ColumnReference, TableName, TableReference};
use crate::store::postgres::query::{Constant, Expression, Transpile, expression::JoinType};

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Table {
    OntologyIds,
    OntologyTemporalMetadata,
    OntologyOwnedMetadata,
    OntologyExternalMetadata,
    OntologyAdditionalMetadata,
    DataTypes,
    DataTypeEmbeddings,
    DataTypeConversions,
    DataTypeConversionAggregation,
    PropertyTypes,
    PropertyTypeEmbeddings,
    EntityTypes,
    FirstTitleForEntity,
    LastTitleForEntity,
    FirstLabelForEntity,
    LastLabelForEntity,
    EntityTypeEmbeddings,
    EntityIds,
    EntityDrafts,
    EntityTemporalMetadata,
    EntityEditions,
    EntityEmbeddings,
    EntityIsOfType,
    EntityIsOfTypeIds,
    EntityHasLeftEntity,
    EntityHasRightEntity,
    EntityEdge,
    Reference(ReferenceTable),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReferenceTable {
    DataTypeInheritsFrom { inheritance_depth: Option<u32> },
    PropertyTypeConstrainsValuesOn,
    PropertyTypeConstrainsPropertiesOn,
    EntityTypeConstrainsPropertiesOn { inheritance_depth: Option<u32> },
    EntityTypeInheritsFrom { inheritance_depth: Option<u32> },
    EntityTypeConstrainsLinksOn { inheritance_depth: Option<u32> },
    EntityTypeConstrainsLinkDestinationsOn { inheritance_depth: Option<u32> },
    EntityIsOfType { inheritance_depth: Option<u32> },
    EntityHasLeftEntity,
    EntityHasRightEntity,
}

impl ReferenceTable {
    #[must_use]
    pub const fn inheritance_depth_column(self) -> Option<Column> {
        match self {
            Self::DataTypeInheritsFrom { inheritance_depth } => Some(Column::DataTypeInheritsFrom(
                DataTypeInheritsFrom::Depth,
                inheritance_depth,
            )),
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth } => {
                Some(Column::EntityTypeConstrainsPropertiesOn(
                    EntityTypeConstrainsPropertiesOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } => Some(
                Column::EntityTypeInheritsFrom(EntityTypeInheritsFrom::Depth, inheritance_depth),
            ),
            Self::EntityTypeConstrainsLinksOn { inheritance_depth } => {
                Some(Column::EntityTypeConstrainsLinksOn(
                    EntityTypeConstrainsLinksOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth } => {
                Some(Column::EntityTypeConstrainsLinkDestinationsOn(
                    EntityTypeConstrainsLinkDestinationsOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityIsOfType { inheritance_depth } => Some(Column::EntityIsOfType(
                EntityIsOfType::InheritanceDepth,
                inheritance_depth,
            )),
            Self::PropertyTypeConstrainsValuesOn
            | Self::PropertyTypeConstrainsPropertiesOn
            | Self::EntityHasLeftEntity
            | Self::EntityHasRightEntity => None,
        }
    }

    #[must_use]
    pub const fn source_relation(self) -> ForeignKeyReference {
        match self {
            Self::DataTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::DataTypeInheritsFrom(
                    DataTypeInheritsFrom::SourceDataTypeOntologyId,
                    inheritance_depth,
                ),
                join_type: JoinType::LeftOuter,
            },
            Self::PropertyTypeConstrainsValuesOn => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypeConstrainsValuesOn(
                    PropertyTypeConstrainsValuesOn::SourcePropertyTypeOntologyId,
                ),
                join_type: JoinType::LeftOuter,
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::SourcePropertyTypeOntologyId,
                ),
                join_type: JoinType::LeftOuter,
            },
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsPropertiesOn(
                        EntityTypeConstrainsPropertiesOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join_type: JoinType::LeftOuter,
                }
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::SourceEntityTypeOntologyId,
                    inheritance_depth,
                ),
                join_type: JoinType::LeftOuter,
            },
            Self::EntityTypeConstrainsLinksOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsLinksOn(
                        EntityTypeConstrainsLinksOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join_type: JoinType::LeftOuter,
                }
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsLinkDestinationsOn(
                        EntityTypeConstrainsLinkDestinationsOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join_type: JoinType::LeftOuter,
                }
            }
            Self::EntityIsOfType { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfType(EntityIsOfType::EntityEditionId, inheritance_depth),
                join_type: JoinType::Inner,
            },
            Self::EntityHasLeftEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::WebId),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::EntityUuid),
                ],
                join_type: JoinType::LeftOuter,
            },
            Self::EntityHasRightEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::WebId),
                    Column::EntityHasRightEntity(EntityHasRightEntity::EntityUuid),
                ],
                join_type: JoinType::LeftOuter,
            },
        }
    }

    #[must_use]
    pub const fn target_relation(self) -> ForeignKeyReference {
        match self {
            Self::DataTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::DataTypeInheritsFrom(
                    DataTypeInheritsFrom::TargetDataTypeOntologyId,
                    inheritance_depth,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join_type: JoinType::RightOuter,
            },
            Self::PropertyTypeConstrainsValuesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypeConstrainsValuesOn(
                    PropertyTypeConstrainsValuesOn::TargetDataTypeOntologyId,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join_type: JoinType::RightOuter,
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join_type: JoinType::RightOuter,
            },
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsPropertiesOn(
                        EntityTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join_type: JoinType::RightOuter,
                }
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::TargetEntityTypeOntologyId,
                    inheritance_depth,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join_type: JoinType::RightOuter,
            },
            Self::EntityTypeConstrainsLinksOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsLinksOn(
                        EntityTypeConstrainsLinksOn::TargetEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join_type: JoinType::RightOuter,
                }
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsLinkDestinationsOn(
                        EntityTypeConstrainsLinkDestinationsOn::TargetEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join_type: JoinType::RightOuter,
                }
            }
            Self::EntityIsOfType { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityIsOfType(EntityIsOfType::EntityTypeOntologyId, inheritance_depth),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join_type: JoinType::Inner,
            },
            Self::EntityHasLeftEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityWebId),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityUuid),
                ],
                join: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join_type: JoinType::RightOuter,
            },
            Self::EntityHasRightEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityWebId),
                    Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityUuid),
                ],
                join: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join_type: JoinType::RightOuter,
            },
        }
    }
}

impl ReferenceTable {
    const fn as_str(self) -> &'static str {
        match self {
            Self::DataTypeInheritsFrom {
                inheritance_depth: _,
            } => "data_type_inherits_from",
            Self::PropertyTypeConstrainsValuesOn => "property_type_constrains_values_on",
            Self::PropertyTypeConstrainsPropertiesOn => "property_type_constrains_properties_on",
            Self::EntityTypeConstrainsPropertiesOn {
                inheritance_depth: _,
            } => "entity_type_constrains_properties_on",
            Self::EntityTypeInheritsFrom {
                inheritance_depth: _,
            } => "entity_type_inherits_from",
            Self::EntityTypeConstrainsLinksOn {
                inheritance_depth: _,
            } => "entity_type_constrains_links_on",
            Self::EntityTypeConstrainsLinkDestinationsOn {
                inheritance_depth: _,
            } => "entity_type_constrains_link_destinations_on",
            Self::EntityIsOfType {
                inheritance_depth: _,
            } => "entity_is_of_type",
            Self::EntityHasLeftEntity => "entity_has_left_entity",
            Self::EntityHasRightEntity => "entity_has_right_entity",
        }
    }
}

impl Table {
    #[must_use]
    pub fn aliased(self, alias: Alias) -> TableReference<'static> {
        TableReference {
            schema: None,
            name: TableName::from(self),
            alias: Some(alias),
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::OntologyIds => "ontology_ids",
            Self::OntologyTemporalMetadata => "ontology_temporal_metadata",
            Self::OntologyOwnedMetadata => "ontology_owned_metadata",
            Self::OntologyExternalMetadata => "ontology_external_metadata",
            Self::OntologyAdditionalMetadata => "ontology_additional_metadata",
            Self::DataTypes => "data_types",
            Self::DataTypeEmbeddings => "data_type_embeddings",
            Self::DataTypeConversions => "data_type_conversions",
            Self::DataTypeConversionAggregation => "data_type_conversion_aggregation",
            Self::PropertyTypes => "property_types",
            Self::PropertyTypeEmbeddings => "property_type_embeddings",
            Self::EntityTypes => "entity_types",
            Self::FirstTitleForEntity => "first_type_title_for_entity",
            Self::LastTitleForEntity => "last_type_title_for_entity",
            Self::FirstLabelForEntity => "first_label_for_entity",
            Self::LastLabelForEntity => "last_label_for_entity",
            Self::EntityTypeEmbeddings => "entity_type_embeddings",
            Self::EntityIds => "entity_ids",
            Self::EntityDrafts => "entity_drafts",
            Self::EntityTemporalMetadata => "entity_temporal_metadata",
            Self::EntityEditions => "entity_editions",
            Self::EntityEmbeddings => "entity_embeddings",
            Self::EntityIsOfType => "entity_is_of_type",
            Self::EntityIsOfTypeIds => "entity_is_of_type_ids",
            Self::EntityHasLeftEntity => "entity_has_left_entity",
            Self::EntityHasRightEntity => "entity_has_right_entity",
            Self::EntityEdge => "entity_edge",
            Self::Reference(table) => table.as_str(),
        }
    }
}

impl Transpile for Table {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, r#""{}""#, self.as_str())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JsonField<'p> {
    JsonPath(&'p JsonPath<'p>),
    JsonPathParameter(usize),
    StaticText(&'static str),
    Label { inheritance_depth: Option<u32> },
}

impl<'p> JsonField<'p> {
    #[must_use]
    pub const fn into_owned(
        self,
        current_parameter_index: usize,
    ) -> (JsonField<'static>, Option<&'p (dyn ToSql + Sync)>) {
        match self {
            Self::JsonPath(path) => (
                JsonField::JsonPathParameter(current_parameter_index),
                Some(path),
            ),
            Self::JsonPathParameter(index) => (JsonField::JsonPathParameter(index), None),
            Self::StaticText(text) => (JsonField::StaticText(text), None),
            Self::Label { inheritance_depth } => (JsonField::Label { inheritance_depth }, None),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StaticJsonField {
    JsonPathParameter(usize),
    StaticText(&'static str),
    StaticJson(&'static str),
}

pub trait DatabaseColumn: Copy {
    fn parameter_type(self) -> ParameterType;
    fn nullable(self) -> bool;
    fn as_str(self) -> &'static str;
}

impl<C> Transpile for C
where
    C: DatabaseColumn + 'static,
{
    fn transpile(&self, fmt: &mut Formatter) -> fmt::Result {
        write!(fmt, r#""{}""#, self.as_str())
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyIds {
    OntologyId,
    BaseUrl,
    Version,
    LatestVersion,
}

impl DatabaseColumn for OntologyIds {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::BaseUrl => ParameterType::Text,
            Self::Version | Self::LatestVersion => ParameterType::OntologyTypeVersion,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::BaseUrl => "base_url",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyOwnedMetadata {
    OntologyId,
    WebId,
}

impl DatabaseColumn for OntologyOwnedMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId | Self::WebId => ParameterType::Uuid,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyExternalMetadata {
    OntologyId,
    FetchedAt,
}

impl DatabaseColumn for OntologyExternalMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::FetchedAt => ParameterType::Timestamp,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::FetchedAt => "fetched_at",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyAdditionalMetadata {
    OntologyId,
    AdditionalMetadata,
}

impl DatabaseColumn for OntologyAdditionalMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::AdditionalMetadata => ParameterType::Object,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::AdditionalMetadata => "additional_metadata",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyTemporalMetadata {
    OntologyId,
    TransactionTime,
    Provenance,
}

impl DatabaseColumn for OntologyTemporalMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Provenance => ParameterType::Any,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::TransactionTime => "transaction_time",
            Self::Provenance => "provenance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OwnedOntologyMetadata {
    OntologyId,
    WebId,
}

impl DatabaseColumn for OwnedOntologyMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId | Self::WebId => ParameterType::Uuid,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypes {
    OntologyId,
    Schema,
}

impl DatabaseColumn for DataTypes {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema => ParameterType::Any,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::OntologyId => false,
            Self::Schema => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypeConversions {
    SourceDataTypeOntologyId,
    TargetDataTypeBaseUrl,
    Into,
    From,
}

impl DatabaseColumn for DataTypeConversions {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId => ParameterType::Uuid,
            Self::TargetDataTypeBaseUrl => ParameterType::BaseUrl,
            Self::Into | Self::From => ParameterType::Object,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::SourceDataTypeOntologyId
            | Self::TargetDataTypeBaseUrl
            | Self::Into
            | Self::From => false,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeBaseUrl => "target_data_type_base_url",
            Self::Into => "into",
            Self::From => "from",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypeConversionAggregation {
    SourceDataTypeOntologyId,
    TargetDataTypeBaseUrls,
    Intos,
    Froms,
}

impl DatabaseColumn for DataTypeConversionAggregation {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId => ParameterType::Uuid,
            Self::TargetDataTypeBaseUrls => ParameterType::Vector(Box::new(ParameterType::BaseUrl)),
            Self::Intos | Self::Froms => ParameterType::Vector(Box::new(ParameterType::Object)),
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::SourceDataTypeOntologyId
            | Self::TargetDataTypeBaseUrls
            | Self::Intos
            | Self::Froms => false,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeBaseUrls => "target_data_type_base_urls",
            Self::Intos => "intos",
            Self::Froms => "froms",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypes {
    OntologyId,
    Schema,
}

impl DatabaseColumn for PropertyTypes {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema => ParameterType::Any,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::OntologyId => false,
            Self::Schema => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypes {
    OntologyId,
    Schema,
    ClosedSchema,
}

impl DatabaseColumn for EntityTypes {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema | Self::ClosedSchema => ParameterType::Any,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::OntologyId | Self::Schema | Self::ClosedSchema => false,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
            Self::ClosedSchema => "closed_schema",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum LabelForEntity {
    EditionId,
    Label,
}

impl DatabaseColumn for LabelForEntity {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::EditionId => ParameterType::Uuid,
            Self::Label => ParameterType::Text,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::EditionId | Self::Label => false,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::EditionId => "entity_edition_id",
            Self::Label => "label_property",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeTitleForEntity {
    EditionId,
    Title,
}

impl DatabaseColumn for TypeTitleForEntity {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::EditionId => ParameterType::Uuid,
            Self::Title => ParameterType::Text,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::EditionId | Self::Title => false,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::EditionId => "entity_edition_id",
            Self::Title => "title",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIds {
    WebId,
    EntityUuid,
    Provenance,
}

impl DatabaseColumn for EntityIds {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid => ParameterType::Uuid,
            Self::Provenance => ParameterType::Any,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::Provenance => "provenance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTemporalMetadata {
    WebId,
    EntityUuid,
    DraftId,
    EditionId,
    DecisionTime,
    TransactionTime,
}

impl EntityTemporalMetadata {
    pub const fn from_time_axis(time_axis: TimeAxis) -> Self {
        match time_axis {
            TimeAxis::DecisionTime => Self::DecisionTime,
            TimeAxis::TransactionTime => Self::TransactionTime,
        }
    }
}

impl DatabaseColumn for EntityTemporalMetadata {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId | Self::EditionId => ParameterType::Uuid,
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::WebId
            | Self::EntityUuid
            | Self::EditionId
            | Self::DecisionTime
            | Self::TransactionTime => false,
            Self::DraftId => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::DraftId => "draft_id",
            Self::EditionId => "entity_edition_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypeEmbeddings {
    OntologyId,
    Embedding,
    UpdatedAtTransactionTime,
    Distance,
}

impl DatabaseColumn for DataTypeEmbeddings {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypeInheritsFrom {
    SourceDataTypeOntologyId,
    TargetDataTypeOntologyId,
    Depth,
}

impl DatabaseColumn for DataTypeInheritsFrom {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId | Self::TargetDataTypeOntologyId => ParameterType::Uuid,
            Self::Depth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
            Self::Depth => "depth",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeEmbeddings {
    OntologyId,
    Embedding,
    UpdatedAtTransactionTime,
    Distance,
}

impl DatabaseColumn for PropertyTypeEmbeddings {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeEmbeddings {
    OntologyId,
    Embedding,
    UpdatedAtTransactionTime,
    Distance,
}

impl DatabaseColumn for EntityTypeEmbeddings {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEmbeddings {
    WebId,
    EntityUuid,
    Embedding,
    Property,
    UpdatedAtTransactionTime,
    UpdatedAtDecisionTime,
    Distance,
}

impl DatabaseColumn for EntityEmbeddings {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::Property => ParameterType::BaseUrl,
            Self::UpdatedAtTransactionTime | Self::UpdatedAtDecisionTime => {
                ParameterType::Timestamp
            }
            Self::Distance => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::WebId
            | Self::EntityUuid
            | Self::Embedding
            | Self::UpdatedAtTransactionTime
            | Self::UpdatedAtDecisionTime
            | Self::Distance => false,
            Self::Property => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::Embedding => "embedding",
            Self::Property => "property",
            Self::UpdatedAtDecisionTime => "updated_at_decision_time",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEditions {
    EditionId,
    Properties,
    Archived,
    Confidence,
    Provenance,
    PropertyMetadata,
}

impl DatabaseColumn for EntityEditions {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::EditionId => ParameterType::Uuid,
            Self::Properties | Self::Provenance | Self::PropertyMetadata => ParameterType::Any,
            Self::Archived => ParameterType::Boolean,
            Self::Confidence => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::EditionId | Self::Archived | Self::Provenance => false,
            Self::Properties | Self::Confidence | Self::PropertyMetadata => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::EditionId => "entity_edition_id",
            Self::Properties => "properties",
            Self::Provenance => "provenance",
            Self::Archived => "archived",
            Self::Confidence => "confidence",
            Self::PropertyMetadata => "property_metadata",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIsOfType {
    EntityEditionId,
    EntityTypeOntologyId,
    InheritanceDepth,
}

impl DatabaseColumn for EntityIsOfType {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::EntityEditionId | Self::EntityTypeOntologyId => ParameterType::Uuid,
            Self::InheritanceDepth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIsOfTypeIds {
    EntityEditionId,
    BaseUrls,
    Versions,
}

impl DatabaseColumn for EntityIsOfTypeIds {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::EntityEditionId => ParameterType::Uuid,
            Self::BaseUrls => ParameterType::Vector(Box::new(ParameterType::BaseUrl)),
            Self::Versions => ParameterType::Vector(Box::new(ParameterType::OntologyTypeVersion)),
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::BaseUrls => "base_urls",
            Self::Versions => "versions",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasLeftEntity {
    WebId,
    EntityUuid,
    LeftEntityWebId,
    LeftEntityUuid,
    Confidence,
    Provenance,
}

impl DatabaseColumn for EntityHasLeftEntity {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::LeftEntityWebId | Self::LeftEntityUuid => {
                ParameterType::Uuid
            }
            Self::Provenance => ParameterType::Any,
            Self::Confidence => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::WebId | Self::EntityUuid | Self::LeftEntityWebId | Self::LeftEntityUuid => false,
            Self::Provenance | Self::Confidence => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::LeftEntityWebId => "left_web_id",
            Self::LeftEntityUuid => "left_entity_uuid",
            Self::Confidence => "confidence",
            Self::Provenance => "provenance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasRightEntity {
    WebId,
    EntityUuid,
    RightEntityWebId,
    RightEntityUuid,
    Confidence,
    Provenance,
}

impl DatabaseColumn for EntityHasRightEntity {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::RightEntityWebId | Self::RightEntityUuid => {
                ParameterType::Uuid
            }
            Self::Provenance => ParameterType::Any,
            Self::Confidence => ParameterType::Decimal,
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::WebId | Self::EntityUuid | Self::RightEntityWebId | Self::RightEntityUuid => {
                false
            }
            Self::Provenance | Self::Confidence => true,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::RightEntityWebId => "right_web_id",
            Self::RightEntityUuid => "right_entity_uuid",
            Self::Confidence => "confidence",
            Self::Provenance => "provenance",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeConstrainsValuesOn {
    SourcePropertyTypeOntologyId,
    TargetDataTypeOntologyId,
}

impl DatabaseColumn for PropertyTypeConstrainsValuesOn {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetDataTypeOntologyId => {
                ParameterType::Uuid
            }
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeConstrainsPropertiesOn {
    SourcePropertyTypeOntologyId,
    TargetPropertyTypeOntologyId,
}

impl DatabaseColumn for PropertyTypeConstrainsPropertiesOn {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                ParameterType::Uuid
            }
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsPropertiesOn {
    SourceEntityTypeOntologyId,
    TargetPropertyTypeOntologyId,
    InheritanceDepth,
}

impl DatabaseColumn for EntityTypeConstrainsPropertiesOn {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeInheritsFrom {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    Depth,
}

impl DatabaseColumn for EntityTypeInheritsFrom {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::Depth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::Depth => "depth",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinksOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    InheritanceDepth,
}

impl DatabaseColumn for EntityTypeConstrainsLinksOn {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinkDestinationsOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    InheritanceDepth,
}

impl DatabaseColumn for EntityTypeConstrainsLinkDestinationsOn {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
        }
    }

    fn nullable(self) -> bool {
        false
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }
}

/// A column in the database.
///
/// If a second parameter is present, it represents the inheritance depths parameter for that view.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Column {
    OntologyIds(OntologyIds),
    OntologyTemporalMetadata(OntologyTemporalMetadata),
    OntologyOwnedMetadata(OntologyOwnedMetadata),
    OntologyExternalMetadata(OntologyExternalMetadata),
    OntologyAdditionalMetadata(OntologyAdditionalMetadata),
    DataTypes(DataTypes),
    DataTypeEmbeddings(DataTypeEmbeddings),
    DataTypeInheritsFrom(DataTypeInheritsFrom, Option<u32>),
    DataTypeConversions(DataTypeConversions),
    DataTypeConversionAggregation(DataTypeConversionAggregation),
    PropertyTypes(PropertyTypes),
    PropertyTypeEmbeddings(PropertyTypeEmbeddings),
    EntityTypes(EntityTypes),
    EntityTypeEmbeddings(EntityTypeEmbeddings),
    EntityIds(EntityIds),
    EntityTemporalMetadata(EntityTemporalMetadata),
    EntityEditions(EntityEditions),
    FirstLabelForEntity(LabelForEntity),
    LastLabelForEntity(LabelForEntity),
    FirstTitleForEntity(TypeTitleForEntity),
    LastTitleForEntity(TypeTitleForEntity),
    EntityEmbeddings(EntityEmbeddings),
    PropertyTypeConstrainsValuesOn(PropertyTypeConstrainsValuesOn),
    PropertyTypeConstrainsPropertiesOn(PropertyTypeConstrainsPropertiesOn),
    EntityTypeConstrainsPropertiesOn(EntityTypeConstrainsPropertiesOn, Option<u32>),
    EntityTypeInheritsFrom(EntityTypeInheritsFrom, Option<u32>),
    EntityTypeConstrainsLinksOn(EntityTypeConstrainsLinksOn, Option<u32>),
    EntityTypeConstrainsLinkDestinationsOn(EntityTypeConstrainsLinkDestinationsOn, Option<u32>),
    EntityIsOfType(EntityIsOfType, Option<u32>),
    EntityIsOfTypeIds(EntityIsOfTypeIds),
    EntityHasLeftEntity(EntityHasLeftEntity),
    EntityHasRightEntity(EntityHasRightEntity),
}

impl Column {
    #[must_use]
    pub fn aliased(self, alias: Alias) -> ColumnReference<'static> {
        ColumnReference {
            correlation: Some(self.table().aliased(alias)),
            name: ColumnName::from(self),
        }
    }
}

impl From<OntologyIds> for Column {
    fn from(column: OntologyIds) -> Self {
        Self::OntologyIds(column)
    }
}

impl From<OntologyTemporalMetadata> for Column {
    fn from(column: OntologyTemporalMetadata) -> Self {
        Self::OntologyTemporalMetadata(column)
    }
}

impl From<OntologyOwnedMetadata> for Column {
    fn from(column: OntologyOwnedMetadata) -> Self {
        Self::OntologyOwnedMetadata(column)
    }
}

impl From<OntologyExternalMetadata> for Column {
    fn from(column: OntologyExternalMetadata) -> Self {
        Self::OntologyExternalMetadata(column)
    }
}

impl From<OntologyAdditionalMetadata> for Column {
    fn from(column: OntologyAdditionalMetadata) -> Self {
        Self::OntologyAdditionalMetadata(column)
    }
}

impl From<DataTypes> for Column {
    fn from(column: DataTypes) -> Self {
        Self::DataTypes(column)
    }
}

impl From<DataTypeEmbeddings> for Column {
    fn from(column: DataTypeEmbeddings) -> Self {
        Self::DataTypeEmbeddings(column)
    }
}

impl From<PropertyTypes> for Column {
    fn from(column: PropertyTypes) -> Self {
        Self::PropertyTypes(column)
    }
}

impl From<PropertyTypeEmbeddings> for Column {
    fn from(column: PropertyTypeEmbeddings) -> Self {
        Self::PropertyTypeEmbeddings(column)
    }
}

impl From<EntityTypes> for Column {
    fn from(column: EntityTypes) -> Self {
        Self::EntityTypes(column)
    }
}

impl From<EntityTypeEmbeddings> for Column {
    fn from(column: EntityTypeEmbeddings) -> Self {
        Self::EntityTypeEmbeddings(column)
    }
}

impl From<EntityIds> for Column {
    fn from(column: EntityIds) -> Self {
        Self::EntityIds(column)
    }
}

impl From<EntityTemporalMetadata> for Column {
    fn from(column: EntityTemporalMetadata) -> Self {
        Self::EntityTemporalMetadata(column)
    }
}

impl From<EntityEditions> for Column {
    fn from(column: EntityEditions) -> Self {
        Self::EntityEditions(column)
    }
}

impl From<EntityEmbeddings> for Column {
    fn from(column: EntityEmbeddings) -> Self {
        Self::EntityEmbeddings(column)
    }
}

impl From<PropertyTypeConstrainsValuesOn> for Column {
    fn from(column: PropertyTypeConstrainsValuesOn) -> Self {
        Self::PropertyTypeConstrainsValuesOn(column)
    }
}

impl From<PropertyTypeConstrainsPropertiesOn> for Column {
    fn from(column: PropertyTypeConstrainsPropertiesOn) -> Self {
        Self::PropertyTypeConstrainsPropertiesOn(column)
    }
}

impl From<EntityTypeConstrainsPropertiesOn> for Column {
    fn from(column: EntityTypeConstrainsPropertiesOn) -> Self {
        Self::EntityTypeConstrainsPropertiesOn(column, None)
    }
}

impl From<EntityTypeInheritsFrom> for Column {
    fn from(column: EntityTypeInheritsFrom) -> Self {
        Self::EntityTypeInheritsFrom(column, None)
    }
}

impl From<EntityTypeConstrainsLinksOn> for Column {
    fn from(column: EntityTypeConstrainsLinksOn) -> Self {
        Self::EntityTypeConstrainsLinksOn(column, None)
    }
}

impl From<EntityTypeConstrainsLinkDestinationsOn> for Column {
    fn from(column: EntityTypeConstrainsLinkDestinationsOn) -> Self {
        Self::EntityTypeConstrainsLinkDestinationsOn(column, None)
    }
}

impl From<EntityIsOfType> for Column {
    fn from(column: EntityIsOfType) -> Self {
        Self::EntityIsOfType(column, None)
    }
}

impl From<EntityIsOfTypeIds> for Column {
    fn from(column: EntityIsOfTypeIds) -> Self {
        Self::EntityIsOfTypeIds(column)
    }
}

impl From<EntityHasLeftEntity> for Column {
    fn from(column: EntityHasLeftEntity) -> Self {
        Self::EntityHasLeftEntity(column)
    }
}

impl From<EntityHasRightEntity> for Column {
    fn from(column: EntityHasRightEntity) -> Self {
        Self::EntityHasRightEntity(column)
    }
}

impl Column {
    #[must_use]
    pub const fn table(self) -> Table {
        match self {
            Self::OntologyIds(_) => Table::OntologyIds,
            Self::OntologyTemporalMetadata(_) => Table::OntologyTemporalMetadata,
            Self::OntologyOwnedMetadata(_) => Table::OntologyOwnedMetadata,
            Self::OntologyExternalMetadata(_) => Table::OntologyExternalMetadata,
            Self::OntologyAdditionalMetadata(_) => Table::OntologyAdditionalMetadata,
            Self::DataTypes(_) => Table::DataTypes,
            Self::DataTypeEmbeddings(_) => Table::DataTypeEmbeddings,
            Self::DataTypeConversions(_) => Table::DataTypeConversions,
            Self::DataTypeConversionAggregation(_) => Table::DataTypeConversionAggregation,
            Self::PropertyTypes(_) => Table::PropertyTypes,
            Self::PropertyTypeEmbeddings(_) => Table::PropertyTypeEmbeddings,
            Self::EntityTypes(_) => Table::EntityTypes,
            Self::EntityTypeEmbeddings(_) => Table::EntityTypeEmbeddings,
            Self::EntityIds(_) => Table::EntityIds,
            Self::EntityTemporalMetadata(_) => Table::EntityTemporalMetadata,
            Self::EntityEditions(_) => Table::EntityEditions,
            Self::FirstLabelForEntity(_) => Table::FirstLabelForEntity,
            Self::LastLabelForEntity(_) => Table::LastLabelForEntity,
            Self::FirstTitleForEntity(_) => Table::FirstTitleForEntity,
            Self::LastTitleForEntity(_) => Table::LastTitleForEntity,
            Self::EntityEmbeddings(_) => Table::EntityEmbeddings,
            Self::DataTypeInheritsFrom(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::DataTypeInheritsFrom { inheritance_depth })
            }
            Self::PropertyTypeConstrainsValuesOn(_) => {
                Table::Reference(ReferenceTable::PropertyTypeConstrainsValuesOn)
            }
            Self::PropertyTypeConstrainsPropertiesOn(_) => {
                Table::Reference(ReferenceTable::PropertyTypeConstrainsPropertiesOn)
            }
            Self::EntityTypeConstrainsPropertiesOn(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsPropertiesOn {
                    inheritance_depth,
                })
            }
            Self::EntityTypeInheritsFrom(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::EntityTypeInheritsFrom { inheritance_depth })
            }
            Self::EntityTypeConstrainsLinksOn(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsLinksOn { inheritance_depth })
            }
            Self::EntityTypeConstrainsLinkDestinationsOn(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsLinkDestinationsOn {
                    inheritance_depth,
                })
            }
            Self::EntityIsOfType(_, inheritance_depth) => {
                Table::Reference(ReferenceTable::EntityIsOfType { inheritance_depth })
            }
            Self::EntityIsOfTypeIds(_) => Table::EntityIsOfTypeIds,
            Self::EntityHasLeftEntity(_) => Table::Reference(ReferenceTable::EntityHasLeftEntity),
            Self::EntityHasRightEntity(_) => Table::Reference(ReferenceTable::EntityHasRightEntity),
        }
    }

    #[must_use]
    pub const fn inheritance_depth(self) -> Option<u32> {
        match self {
            Self::DataTypeInheritsFrom(_, inheritance_depth)
            | Self::EntityTypeInheritsFrom(_, inheritance_depth)
            | Self::EntityTypeConstrainsPropertiesOn(_, inheritance_depth)
            | Self::EntityTypeConstrainsLinksOn(_, inheritance_depth)
            | Self::EntityTypeConstrainsLinkDestinationsOn(_, inheritance_depth)
            | Self::EntityIsOfType(_, inheritance_depth) => inheritance_depth,
            Self::OntologyIds(_)
            | Self::OntologyTemporalMetadata(_)
            | Self::OntologyOwnedMetadata(_)
            | Self::OntologyExternalMetadata(_)
            | Self::OntologyAdditionalMetadata(_)
            | Self::DataTypes(_)
            | Self::DataTypeEmbeddings(_)
            | Self::DataTypeConversions(_)
            | Self::DataTypeConversionAggregation(_)
            | Self::PropertyTypes(_)
            | Self::PropertyTypeEmbeddings(_)
            | Self::EntityTypes(_)
            | Self::EntityTypeEmbeddings(_)
            | Self::EntityIds(_)
            | Self::EntityTemporalMetadata(_)
            | Self::EntityEditions(_)
            | Self::FirstLabelForEntity(_)
            | Self::LastLabelForEntity(_)
            | Self::FirstTitleForEntity(_)
            | Self::LastTitleForEntity(_)
            | Self::EntityEmbeddings(_)
            | Self::PropertyTypeConstrainsValuesOn(_)
            | Self::PropertyTypeConstrainsPropertiesOn(_)
            | Self::EntityIsOfTypeIds(_)
            | Self::EntityHasLeftEntity(_)
            | Self::EntityHasRightEntity(_) => None,
        }
    }
}

impl DatabaseColumn for Column {
    fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyIds(column) => column.parameter_type(),
            Self::OntologyTemporalMetadata(column) => column.parameter_type(),
            Self::OntologyOwnedMetadata(column) => column.parameter_type(),
            Self::OntologyExternalMetadata(column) => column.parameter_type(),
            Self::OntologyAdditionalMetadata(column) => column.parameter_type(),
            Self::DataTypes(column) => column.parameter_type(),
            Self::DataTypeEmbeddings(column) => column.parameter_type(),
            Self::DataTypeInheritsFrom(column, _) => column.parameter_type(),
            Self::DataTypeConversions(column) => column.parameter_type(),
            Self::DataTypeConversionAggregation(column) => column.parameter_type(),
            Self::PropertyTypes(column) => column.parameter_type(),
            Self::PropertyTypeEmbeddings(column) => column.parameter_type(),
            Self::EntityTypes(column) => column.parameter_type(),
            Self::EntityTypeEmbeddings(column) => column.parameter_type(),
            Self::EntityIds(column) => column.parameter_type(),
            Self::EntityTemporalMetadata(column) => column.parameter_type(),
            Self::EntityEditions(column) => column.parameter_type(),
            Self::FirstLabelForEntity(column) | Self::LastLabelForEntity(column) => {
                column.parameter_type()
            }
            Self::FirstTitleForEntity(column) | Self::LastTitleForEntity(column) => {
                column.parameter_type()
            }
            Self::EntityEmbeddings(column) => column.parameter_type(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.parameter_type(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.parameter_type(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.parameter_type(),
            Self::EntityTypeInheritsFrom(column, _) => column.parameter_type(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.parameter_type(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.parameter_type(),
            Self::EntityIsOfType(column, _) => column.parameter_type(),
            Self::EntityIsOfTypeIds(column) => column.parameter_type(),
            Self::EntityHasLeftEntity(column) => column.parameter_type(),
            Self::EntityHasRightEntity(column) => column.parameter_type(),
        }
    }

    fn nullable(self) -> bool {
        match self {
            Self::OntologyIds(column) => column.nullable(),
            Self::OntologyTemporalMetadata(column) => column.nullable(),
            Self::OntologyOwnedMetadata(column) => column.nullable(),
            Self::OntologyExternalMetadata(column) => column.nullable(),
            Self::OntologyAdditionalMetadata(column) => column.nullable(),
            Self::DataTypes(column) => column.nullable(),
            Self::DataTypeEmbeddings(column) => column.nullable(),
            Self::DataTypeInheritsFrom(column, _) => column.nullable(),
            Self::DataTypeConversions(column) => column.nullable(),
            Self::DataTypeConversionAggregation(column) => column.nullable(),
            Self::PropertyTypes(column) => column.nullable(),
            Self::PropertyTypeEmbeddings(column) => column.nullable(),
            Self::EntityTypes(column) => column.nullable(),
            Self::EntityTypeEmbeddings(column) => column.nullable(),
            Self::EntityIds(column) => column.nullable(),
            Self::EntityTemporalMetadata(column) => column.nullable(),
            Self::EntityEditions(column) => column.nullable(),
            Self::FirstLabelForEntity(column) | Self::LastLabelForEntity(column) => {
                column.nullable()
            }
            Self::FirstTitleForEntity(column) | Self::LastTitleForEntity(column) => {
                column.nullable()
            }
            Self::EntityEmbeddings(column) => column.nullable(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.nullable(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.nullable(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.nullable(),
            Self::EntityTypeInheritsFrom(column, _) => column.nullable(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.nullable(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.nullable(),
            Self::EntityIsOfType(column, _) => column.nullable(),
            Self::EntityIsOfTypeIds(column) => column.nullable(),
            Self::EntityHasLeftEntity(column) => column.nullable(),
            Self::EntityHasRightEntity(column) => column.nullable(),
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::OntologyIds(column) => column.as_str(),
            Self::OntologyTemporalMetadata(column) => column.as_str(),
            Self::OntologyOwnedMetadata(column) => column.as_str(),
            Self::OntologyExternalMetadata(column) => column.as_str(),
            Self::OntologyAdditionalMetadata(column) => column.as_str(),
            Self::DataTypes(column) => column.as_str(),
            Self::DataTypeEmbeddings(column) => column.as_str(),
            Self::DataTypeInheritsFrom(column, _) => column.as_str(),
            Self::DataTypeConversions(column) => column.as_str(),
            Self::DataTypeConversionAggregation(column) => column.as_str(),
            Self::PropertyTypes(column) => column.as_str(),
            Self::PropertyTypeEmbeddings(column) => column.as_str(),
            Self::EntityTypes(column) => column.as_str(),
            Self::EntityTypeEmbeddings(column) => column.as_str(),
            Self::EntityIds(column) => column.as_str(),
            Self::EntityTemporalMetadata(column) => column.as_str(),
            Self::EntityEditions(column) => column.as_str(),
            Self::FirstLabelForEntity(column) | Self::LastLabelForEntity(column) => column.as_str(),
            Self::FirstTitleForEntity(column) | Self::LastTitleForEntity(column) => column.as_str(),
            Self::EntityEmbeddings(column) => column.as_str(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.as_str(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.as_str(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.as_str(),
            Self::EntityTypeInheritsFrom(column, _) => column.as_str(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.as_str(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.as_str(),
            Self::EntityIsOfType(column, _) => column.as_str(),
            Self::EntityIsOfTypeIds(column) => column.as_str(),
            Self::EntityHasLeftEntity(column) => column.as_str(),
            Self::EntityHasRightEntity(column) => column.as_str(),
        }
    }
}

/// Alias parameters used to uniquely identify a [`Table`].
///
/// When joining tables in a query, it's necessary that the names used to reference them are unique.
/// Achieving this can require aliasing the names if the various parts of the query rely on the same
/// [`Table`] but under different conditions. To appropriately identify a [`Table`] when aliased,
/// some additional information associated with it may be needed.
///
/// # Examples
///
/// When specifying multiple conditions or deeply nested queries containing the same [`Table`],
/// `TableAlias` uniquely identifies the condition and the depth of the query.
///
/// ## Multiple Conditions
///
/// When searching for a [`PropertyType`], which should contain two different [`DataType`]s,
/// the same [`Table`] has to be joined twice, but with different conditions. `condition_index` is
/// used here to distinguish between these.
///
/// ## Deeply nested query chains
///
/// It's possible to have queries which require the same [`Table`] multiple times in a chain. For
/// example, when searching for a [`PropertyType`] which references a [`PropertyType`] which in turn
/// references another [`PropertyType`], the `Table::PropertyTypePropertyTypeReferences` has to be
/// joined twice within the same condition. The `chain_depth` will be used to uniquely identify
/// the different tables.
///
/// [`DataType`]: type_system::ontology::data_type::DataType
/// [`PropertyType`]: type_system::ontology::property_type::PropertyType
#[derive(Debug, Default, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Alias {
    pub condition_index: usize,
    pub chain_depth: usize,
    pub number: usize,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Relation {
    OntologyIds,
    OntologyOwnedMetadata,
    OntologyExternalMetadata,
    OntologyAdditionalMetadata,
    DataTypeIds,
    DataTypeConversions,
    DataTypeEmbeddings,
    PropertyTypeIds,
    EntityTypeIds,
    EntityIsOfTypes,
    EntityIds,
    EntityEditions,
    FirstTitleForEntity,
    LastTitleForEntity,
    FirstLabelForEntity,
    LastLabelForEntity,
    PropertyTypeEmbeddings,
    EntityTypeEmbeddings,
    EntityEmbeddings,
    LeftEntity,
    RightEntity,
    Reference {
        table: ReferenceTable,
        direction: EdgeDirection,
    },
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ForeignKeyReference {
    Single {
        on: Column,
        join: Column,
        join_type: JoinType,
    },
    Double {
        on: [Column; 2],
        join: [Column; 2],
        join_type: JoinType,
    },
}

impl ForeignKeyReference {
    pub const fn join_type(self) -> JoinType {
        match self {
            Self::Single { join_type, .. } | Self::Double { join_type, .. } => join_type,
        }
    }

    pub const fn table(self) -> Table {
        match self {
            Self::Single { join, .. } => join.table(),
            Self::Double { join, .. } => join[0].table(),
        }
    }

    #[must_use]
    pub const fn reverse(self) -> Self {
        match self {
            Self::Single {
                on,
                join,
                join_type,
            } => Self::Single {
                on: join,
                join: on,
                join_type: join_type.reverse(),
            },
            Self::Double {
                on,
                join,
                join_type,
            } => Self::Double {
                on: join,
                join: on,
                join_type: join_type.reverse(),
            },
        }
    }

    pub fn conditions(self, on_alias: Alias, join_alias: Alias) -> Vec<Expression> {
        match self {
            Self::Single {
                join,
                on,
                join_type: _,
            } => vec![Expression::equal(
                Expression::ColumnReference(join.aliased(join_alias)),
                Expression::ColumnReference(on.aliased(on_alias)),
            )],
            Self::Double {
                join: [join1, join2],
                on: [on1, on2],
                join_type: _,
            } => vec![
                Expression::equal(
                    Expression::ColumnReference(join1.aliased(join_alias)),
                    Expression::ColumnReference(on1.aliased(on_alias)),
                ),
                Expression::equal(
                    Expression::ColumnReference(join2.aliased(join_alias)),
                    Expression::ColumnReference(on2.aliased(on_alias)),
                ),
            ],
        }
    }
}

pub enum ForeignKeyJoin {
    Plain(Once<ForeignKeyReference>),
    Reference(Chain<Once<ForeignKeyReference>, Once<ForeignKeyReference>>),
}

impl ForeignKeyJoin {
    fn from_reference(reference: ForeignKeyReference) -> Self {
        Self::Plain(once(reference))
    }

    fn from_reference_table(table: ReferenceTable, direction: EdgeDirection) -> Self {
        Self::Reference(match direction {
            EdgeDirection::Incoming => once(table.target_relation().reverse())
                .chain(once(table.source_relation().reverse())),
            EdgeDirection::Outgoing => {
                once(table.source_relation()).chain(once(table.target_relation()))
            }
        })
    }
}

impl Iterator for ForeignKeyJoin {
    type Item = ForeignKeyReference;

    fn next(&mut self) -> Option<Self::Item> {
        match self {
            Self::Plain(value) => value.next(),
            Self::Reference(values) => values.next(),
        }
    }
}

impl Relation {
    #[expect(clippy::too_many_lines)]
    #[must_use]
    pub fn joins(self) -> ForeignKeyJoin {
        match self {
            Self::OntologyIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
                join_type: JoinType::Inner,
            }),
            Self::OntologyOwnedMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyOwnedMetadata(OntologyOwnedMetadata::OntologyId),
                    join_type: JoinType::Inner,
                })
            }
            Self::OntologyExternalMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyExternalMetadata(OntologyExternalMetadata::OntologyId),
                    join_type: JoinType::Inner,
                })
            }
            Self::OntologyAdditionalMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyAdditionalMetadata(
                        OntologyAdditionalMetadata::OntologyId,
                    ),
                    join_type: JoinType::Inner,
                })
            }
            Self::DataTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::DataTypes(DataTypes::OntologyId),
                join_type: JoinType::Inner,
            }),
            Self::DataTypeConversions => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::DataTypeConversionAggregation(
                        DataTypeConversionAggregation::SourceDataTypeOntologyId,
                    ),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::DataTypeEmbeddings => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::DataTypeEmbeddings(DataTypeEmbeddings::OntologyId),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::PropertyTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypes(PropertyTypes::OntologyId),
                join_type: JoinType::Inner,
            }),
            Self::PropertyTypeEmbeddings => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::PropertyTypeEmbeddings(PropertyTypeEmbeddings::OntologyId),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::EntityTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::EntityTypes(EntityTypes::OntologyId),
                join_type: JoinType::Inner,
            }),
            Self::EntityIsOfTypes => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfTypeIds(EntityIsOfTypeIds::EntityEditionId),
                join_type: JoinType::Inner,
            }),
            Self::EntityTypeEmbeddings => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeEmbeddings(EntityTypeEmbeddings::OntologyId),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::EntityIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityIds(EntityIds::WebId),
                    Column::EntityIds(EntityIds::EntityUuid),
                ],
                join_type: JoinType::Inner,
            }),
            Self::EntityEditions => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityEditions(EntityEditions::EditionId),
                join_type: JoinType::Inner,
            }),
            Self::FirstTitleForEntity => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                    join: Column::FirstTitleForEntity(TypeTitleForEntity::EditionId),
                    join_type: JoinType::Inner,
                })
            }
            Self::LastTitleForEntity => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                    join: Column::LastTitleForEntity(TypeTitleForEntity::EditionId),
                    join_type: JoinType::Inner,
                })
            }
            Self::FirstLabelForEntity => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                    join: Column::FirstLabelForEntity(LabelForEntity::EditionId),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::LastLabelForEntity => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                    join: Column::LastLabelForEntity(LabelForEntity::EditionId),
                    join_type: JoinType::LeftOuter,
                })
            }
            Self::EntityEmbeddings => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityEmbeddings(EntityEmbeddings::WebId),
                    Column::EntityEmbeddings(EntityEmbeddings::EntityUuid),
                ],
                join_type: JoinType::LeftOuter,
            }),
            Self::LeftEntity => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::WebId),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::EntityUuid),
                ],
                join_type: JoinType::LeftOuter,
            }),
            Self::RightEntity => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::WebId),
                    Column::EntityHasRightEntity(EntityHasRightEntity::EntityUuid),
                ],
                join_type: JoinType::LeftOuter,
            }),
            Self::Reference {
                table, direction, ..
            } => ForeignKeyJoin::from_reference_table(table, direction),
        }
    }

    #[must_use]
    pub fn additional_conditions(self, table: &TableReference<'_>) -> Vec<Expression> {
        match self {
            Self::Reference {
                table: reference_table,
                ..
            } if table.name == TableName::from(Table::Reference(reference_table)) => {
                reference_table
                    .inheritance_depth_column()
                    .map(|column| {
                        column
                            .inheritance_depth()
                            .map_or_else(Vec::new, |inheritance_depth| {
                                vec![Expression::less_or_equal(
                                    Expression::ColumnReference(
                                        column.aliased(table.alias.unwrap_or_default()),
                                    ),
                                    Expression::Constant(Constant::UnsignedInteger(
                                        inheritance_depth,
                                    )),
                                )]
                            })
                    })
                    .unwrap_or_default()
            }
            Self::OntologyIds
            | Self::OntologyOwnedMetadata
            | Self::OntologyExternalMetadata
            | Self::OntologyAdditionalMetadata
            | Self::DataTypeIds
            | Self::DataTypeConversions
            | Self::DataTypeEmbeddings
            | Self::PropertyTypeIds
            | Self::EntityTypeIds
            | Self::EntityIsOfTypes
            | Self::EntityIds
            | Self::EntityEditions
            | Self::FirstTitleForEntity
            | Self::LastTitleForEntity
            | Self::FirstLabelForEntity
            | Self::LastLabelForEntity
            | Self::PropertyTypeEmbeddings
            | Self::EntityTypeEmbeddings
            | Self::EntityEmbeddings
            | Self::LeftEntity
            | Self::RightEntity
            | Self::Reference { .. } => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use hash_graph_store::data_type::DataTypeQueryPath;

    use super::*;
    use crate::store::postgres::query::PostgresQueryPath as _;

    #[test]
    fn transpile_table() {
        assert_eq!(
            Table::OntologyIds.transpile_to_string(),
            r#""ontology_ids""#
        );
        assert_eq!(Table::DataTypes.transpile_to_string(), r#""data_types""#);
    }

    #[test]
    fn transpile_aliased_table() {
        assert_eq!(
            Table::OntologyIds
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                })
                .transpile_to_string(),
            r#""ontology_ids_1_2_3""#
        );
    }

    #[test]
    fn transpile_column() {
        assert_eq!(
            DataTypeQueryPath::OntologyId
                .terminating_column()
                .0
                .transpile_to_string(),
            r#""ontology_id""#
        );
        assert_eq!(
            DataTypeQueryPath::Title
                .terminating_column()
                .0
                .transpile_to_string(),
            r#""schema""#
        );
        assert_eq!(
            DataTypeQueryPath::Title.terminating_column().1,
            Some(JsonField::StaticText("title"))
        );
    }
}
