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

use super::{
    expression::{ColumnName, ColumnReference, TableName, TableReference},
    postgres_type::PostgresType,
};
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
    EntityTypeEmbeddings,
    EntityIds,
    EntityDrafts,
    EntityTemporalMetadata,
    EntityEditions,
    EntityEditionCache,
    EntityEmbeddings,
    EntityIsOfType,
    EntityHasLeftEntity,
    EntityHasRightEntity,
    EntityEdge,
    Action,
    ActionHierarchy,
    Policy,
    PolicyEdition,
    PolicyAction,
    UserActor,
    MachineActor,
    AiActor,
    Web,
    Team,
    Role,
    ActorRole,
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
            Self::EntityTypeEmbeddings => "entity_type_embeddings",
            Self::EntityIds => "entity_ids",
            Self::EntityDrafts => "entity_drafts",
            Self::EntityTemporalMetadata => "entity_temporal_metadata",
            Self::EntityEditions => "entity_editions",
            Self::EntityEditionCache => "entity_edition_cache",
            Self::EntityEmbeddings => "entity_embeddings",
            Self::EntityIsOfType => "entity_is_of_type",
            Self::EntityHasLeftEntity => "entity_has_left_entity",
            Self::EntityHasRightEntity => "entity_has_right_entity",
            Self::EntityEdge => "entity_edge",
            Self::Action => "action",
            Self::ActionHierarchy => "action_hierarchy",
            Self::Policy => "policy",
            Self::PolicyEdition => "policy_edition",
            Self::PolicyAction => "policy_action",
            Self::UserActor => "user_actor",
            Self::MachineActor => "machine_actor",
            Self::AiActor => "ai_actor",
            Self::Web => "web",
            Self::Team => "team",
            Self::Role => "role",
            Self::ActorRole => "actor_role",
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
    /// 1-based Postgres array subscript, e.g. `("table"."column")[1]`.
    ///
    /// Filter parameters against subscripted columns are typed as [`ParameterType::Text`],
    /// so this is only valid for text arrays.
    ArrayElement(usize),
    Label {
        inheritance_depth: Option<u32>,
    },
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
            Self::ArrayElement(index) => (JsonField::ArrayElement(index), None),
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

/// A physical column of a database table: its SQL name and storage type.
pub trait DatabaseColumn {
    fn as_str(&self) -> &str;

    /// The Postgres type of the column as stored in the database.
    fn postgres_type(&self) -> PostgresType;
}

/// A column the query compiler accepts filter parameters for.
pub trait FilterColumn: DatabaseColumn {
    /// The logical type filter values compared against this column must have.
    fn parameter_type(&self) -> ParameterType;
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::BaseUrl => "base_url",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::BaseUrl => PostgresType::Text,
            Self::Version | Self::LatestVersion => PostgresType::Int8,
        }
    }
}

impl FilterColumn for OntologyIds {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::BaseUrl => ParameterType::Text,
            Self::Version | Self::LatestVersion => ParameterType::OntologyTypeVersion,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyOwnedMetadata {
    OntologyId,
    WebId,
}

impl DatabaseColumn for OntologyOwnedMetadata {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId | Self::WebId => PostgresType::Uuid,
        }
    }
}

impl FilterColumn for OntologyOwnedMetadata {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId | Self::WebId => ParameterType::Uuid,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyExternalMetadata {
    OntologyId,
    FetchedAt,
}

impl DatabaseColumn for OntologyExternalMetadata {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::FetchedAt => "fetched_at",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::FetchedAt => PostgresType::TimestampTz,
        }
    }
}

impl FilterColumn for OntologyExternalMetadata {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::FetchedAt => ParameterType::Timestamp,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyAdditionalMetadata {
    OntologyId,
    AdditionalMetadata,
}

impl DatabaseColumn for OntologyAdditionalMetadata {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::AdditionalMetadata => "additional_metadata",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::AdditionalMetadata => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for OntologyAdditionalMetadata {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::AdditionalMetadata => ParameterType::Object,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::TransactionTime => "transaction_time",
            Self::Provenance => "provenance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::TransactionTime => PostgresType::TstzRange,
            Self::Provenance => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for OntologyTemporalMetadata {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::TransactionTime => ParameterType::TimeInterval,
            Self::Provenance => ParameterType::Any,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OwnedOntologyMetadata {
    OntologyId,
    WebId,
}

impl DatabaseColumn for OwnedOntologyMetadata {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId | Self::WebId => PostgresType::Uuid,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum DataTypes {
    OntologyId,
    Schema,
    ClosedSchema,
}

impl DatabaseColumn for DataTypes {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
            Self::ClosedSchema => "closed_schema",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Schema | Self::ClosedSchema => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for DataTypes {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema | Self::ClosedSchema => ParameterType::Any,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeBaseUrl => "target_data_type_base_url",
            Self::Into => "into",
            Self::From => "from",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceDataTypeOntologyId => PostgresType::Uuid,
            Self::TargetDataTypeBaseUrl => PostgresType::Text,
            Self::Into | Self::From => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for DataTypeConversions {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId => ParameterType::Uuid,
            Self::TargetDataTypeBaseUrl => ParameterType::BaseUrl,
            Self::Into | Self::From => ParameterType::Object,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeBaseUrls => "target_data_type_base_urls",
            Self::Intos => "intos",
            Self::Froms => "froms",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceDataTypeOntologyId => PostgresType::Uuid,
            Self::TargetDataTypeBaseUrls => PostgresType::Array(Box::new(PostgresType::Text)),
            Self::Intos | Self::Froms => PostgresType::Array(Box::new(PostgresType::JsonB)),
        }
    }
}

impl FilterColumn for DataTypeConversionAggregation {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId => ParameterType::Uuid,
            Self::TargetDataTypeBaseUrls => ParameterType::Vector(Box::new(ParameterType::BaseUrl)),
            Self::Intos | Self::Froms => ParameterType::Vector(Box::new(ParameterType::Object)),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypes {
    OntologyId,
    Schema,
}

impl DatabaseColumn for PropertyTypes {
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Schema => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for PropertyTypes {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema => ParameterType::Any,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Schema => "schema",
            Self::ClosedSchema => "closed_schema",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Schema | Self::ClosedSchema => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for EntityTypes {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema | Self::ClosedSchema => ParameterType::Any,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEditionCache {
    EntityEditionId,
    DirectTypes,
    Labels,
    TypeTitles,
    BaseUrls,
    Versions,
    VersionedUrls,
}

impl DatabaseColumn for EntityEditionCache {
    fn as_str(&self) -> &'static str {
        match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::DirectTypes => "direct_types",
            Self::Labels => "labels",
            Self::TypeTitles => "type_titles",
            Self::BaseUrls => "base_urls",
            Self::Versions => "versions",
            Self::VersionedUrls => "versioned_urls",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::EntityEditionId => PostgresType::Uuid,
            Self::DirectTypes => PostgresType::Int4,
            Self::Labels | Self::TypeTitles | Self::BaseUrls | Self::VersionedUrls => {
                PostgresType::Array(Box::new(PostgresType::Text))
            }
            Self::Versions => PostgresType::Array(Box::new(PostgresType::Int8)),
        }
    }
}

impl FilterColumn for EntityEditionCache {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::EntityEditionId => ParameterType::Uuid,
            Self::DirectTypes => ParameterType::Integer,
            Self::Labels | Self::TypeTitles => ParameterType::Vector(Box::new(ParameterType::Text)),
            Self::BaseUrls => ParameterType::Vector(Box::new(ParameterType::BaseUrl)),
            Self::Versions => ParameterType::Vector(Box::new(ParameterType::OntologyTypeVersion)),
            Self::VersionedUrls => ParameterType::Vector(Box::new(ParameterType::VersionedUrl)),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIds {
    WebId,
    EntityUuid,
    Provenance,
    ReadOnly,
}

impl DatabaseColumn for EntityIds {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::Provenance => "provenance",
            Self::ReadOnly => "read_only",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid => PostgresType::Uuid,
            Self::Provenance => PostgresType::JsonB,
            Self::ReadOnly => PostgresType::Bool,
        }
    }
}

impl FilterColumn for EntityIds {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid => ParameterType::Uuid,
            Self::Provenance => ParameterType::Any,
            Self::ReadOnly => ParameterType::Boolean,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityDrafts {
    WebId,
    EntityUuid,
    DraftId,
}

impl DatabaseColumn for EntityDrafts {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::DraftId => "draft_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId => PostgresType::Uuid,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEdge {
    SourceWebId,
    SourceEntityUuid,
    TargetWebId,
    TargetEntityUuid,
    Kind,
    Direction,
    Provenance,
    Confidence,
}

impl DatabaseColumn for EntityEdge {
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceWebId => "source_web_id",
            Self::SourceEntityUuid => "source_entity_uuid",
            Self::TargetWebId => "target_web_id",
            Self::TargetEntityUuid => "target_entity_uuid",
            Self::Kind => "kind",
            Self::Direction => "direction",
            Self::Provenance => "provenance",
            Self::Confidence => "confidence",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceWebId
            | Self::SourceEntityUuid
            | Self::TargetWebId
            | Self::TargetEntityUuid => PostgresType::Uuid,
            Self::Kind => PostgresType::EntityEdgeKind,
            Self::Direction => PostgresType::EdgeDirection,
            Self::Provenance => PostgresType::JsonB,
            Self::Confidence => PostgresType::Float8,
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
    #[must_use]
    pub const fn from_time_axis(time_axis: TimeAxis) -> Self {
        match time_axis {
            TimeAxis::DecisionTime => Self::DecisionTime,
            TimeAxis::TransactionTime => Self::TransactionTime,
        }
    }
}

impl DatabaseColumn for EntityTemporalMetadata {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::DraftId => "draft_id",
            Self::EditionId => "entity_edition_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId | Self::EditionId => PostgresType::Uuid,
            Self::DecisionTime | Self::TransactionTime => PostgresType::TstzRange,
        }
    }
}

impl FilterColumn for EntityTemporalMetadata {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId | Self::EditionId => ParameterType::Uuid,
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Embedding => PostgresType::Vector,
            Self::UpdatedAtTransactionTime => PostgresType::TimestampTz,
            Self::Distance => PostgresType::Float8,
        }
    }
}

impl FilterColumn for DataTypeEmbeddings {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceDataTypeOntologyId => "source_data_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
            Self::Depth => "depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceDataTypeOntologyId | Self::TargetDataTypeOntologyId => PostgresType::Uuid,
            Self::Depth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for DataTypeInheritsFrom {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceDataTypeOntologyId | Self::TargetDataTypeOntologyId => ParameterType::Uuid,
            Self::Depth => ParameterType::Integer,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Embedding => PostgresType::Vector,
            Self::UpdatedAtTransactionTime => PostgresType::TimestampTz,
            Self::Distance => PostgresType::Float8,
        }
    }
}

impl FilterColumn for PropertyTypeEmbeddings {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::OntologyId => "ontology_id",
            Self::Embedding => "embedding",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyId => PostgresType::Uuid,
            Self::Embedding => PostgresType::Vector,
            Self::UpdatedAtTransactionTime => PostgresType::TimestampTz,
            Self::Distance => PostgresType::Float8,
        }
    }
}

impl FilterColumn for EntityTypeEmbeddings {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::UpdatedAtTransactionTime => ParameterType::Timestamp,
            Self::Distance => ParameterType::Decimal,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEmbeddings {
    WebId,
    EntityUuid,
    DraftId,
    Embedding,
    Property,
    UpdatedAtTransactionTime,
    UpdatedAtDecisionTime,
    Distance,
}

impl DatabaseColumn for EntityEmbeddings {
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::DraftId => "draft_id",
            Self::Embedding => "embedding",
            Self::Property => "property",
            Self::UpdatedAtDecisionTime => "updated_at_decision_time",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId => PostgresType::Uuid,
            Self::Embedding => PostgresType::Vector,
            Self::Property => PostgresType::Text,
            Self::UpdatedAtTransactionTime | Self::UpdatedAtDecisionTime => {
                PostgresType::TimestampTz
            }
            Self::Distance => PostgresType::Float8,
        }
    }
}

impl FilterColumn for EntityEmbeddings {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::DraftId => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector(Box::new(ParameterType::Decimal)),
            Self::Property => ParameterType::BaseUrl,
            Self::UpdatedAtTransactionTime | Self::UpdatedAtDecisionTime => {
                ParameterType::Timestamp
            }
            Self::Distance => ParameterType::Decimal,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::EditionId => "entity_edition_id",
            Self::Properties => "properties",
            Self::Provenance => "provenance",
            Self::Archived => "archived",
            Self::Confidence => "confidence",
            Self::PropertyMetadata => "property_metadata",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::EditionId => PostgresType::Uuid,
            Self::Properties | Self::Provenance | Self::PropertyMetadata => PostgresType::JsonB,
            Self::Archived => PostgresType::Bool,
            Self::Confidence => PostgresType::Float8,
        }
    }
}

impl FilterColumn for EntityEditions {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::EditionId => ParameterType::Uuid,
            Self::Properties | Self::Provenance | Self::PropertyMetadata => ParameterType::Any,
            Self::Archived => ParameterType::Boolean,
            Self::Confidence => ParameterType::Decimal,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::EntityEditionId | Self::EntityTypeOntologyId => PostgresType::Uuid,
            Self::InheritanceDepth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for EntityIsOfType {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::EntityEditionId | Self::EntityTypeOntologyId => ParameterType::Uuid,
            Self::InheritanceDepth => ParameterType::Integer,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::LeftEntityWebId => "left_web_id",
            Self::LeftEntityUuid => "left_entity_uuid",
            Self::Confidence => "confidence",
            Self::Provenance => "provenance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::LeftEntityWebId | Self::LeftEntityUuid => {
                PostgresType::Uuid
            }
            Self::Confidence => PostgresType::Float8,
            Self::Provenance => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for EntityHasLeftEntity {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::LeftEntityWebId | Self::LeftEntityUuid => {
                ParameterType::Uuid
            }
            Self::Provenance => ParameterType::Any,
            Self::Confidence => ParameterType::Decimal,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::RightEntityWebId => "right_web_id",
            Self::RightEntityUuid => "right_entity_uuid",
            Self::Confidence => "confidence",
            Self::Provenance => "provenance",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::WebId | Self::EntityUuid | Self::RightEntityWebId | Self::RightEntityUuid => {
                PostgresType::Uuid
            }
            Self::Confidence => PostgresType::Float8,
            Self::Provenance => PostgresType::JsonB,
        }
    }
}

impl FilterColumn for EntityHasRightEntity {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::RightEntityWebId | Self::RightEntityUuid => {
                ParameterType::Uuid
            }
            Self::Provenance => ParameterType::Any,
            Self::Confidence => ParameterType::Decimal,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeConstrainsValuesOn {
    SourcePropertyTypeOntologyId,
    TargetDataTypeOntologyId,
}

impl DatabaseColumn for PropertyTypeConstrainsValuesOn {
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetDataTypeOntologyId => {
                PostgresType::Uuid
            }
        }
    }
}

impl FilterColumn for PropertyTypeConstrainsValuesOn {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetDataTypeOntologyId => {
                ParameterType::Uuid
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeConstrainsPropertiesOn {
    SourcePropertyTypeOntologyId,
    TargetPropertyTypeOntologyId,
}

impl DatabaseColumn for PropertyTypeConstrainsPropertiesOn {
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                PostgresType::Uuid
            }
        }
    }
}

impl FilterColumn for PropertyTypeConstrainsPropertiesOn {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourcePropertyTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                ParameterType::Uuid
            }
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                PostgresType::Uuid
            }
            Self::InheritanceDepth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for EntityTypeConstrainsPropertiesOn {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::Depth => "depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                PostgresType::Uuid
            }
            Self::Depth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for EntityTypeInheritsFrom {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::Depth => ParameterType::Integer,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                PostgresType::Uuid
            }
            Self::InheritanceDepth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for EntityTypeConstrainsLinksOn {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
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
    fn as_str(&self) -> &'static str {
        match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                PostgresType::Uuid
            }
            Self::InheritanceDepth => PostgresType::Int4,
        }
    }
}

impl FilterColumn for EntityTypeConstrainsLinkDestinationsOn {
    fn parameter_type(&self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::Integer,
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
    EntityEditionCache(EntityEditionCache),
    EntityEmbeddings(EntityEmbeddings),
    PropertyTypeConstrainsValuesOn(PropertyTypeConstrainsValuesOn),
    PropertyTypeConstrainsPropertiesOn(PropertyTypeConstrainsPropertiesOn),
    EntityTypeConstrainsPropertiesOn(EntityTypeConstrainsPropertiesOn, Option<u32>),
    EntityTypeInheritsFrom(EntityTypeInheritsFrom, Option<u32>),
    EntityTypeConstrainsLinksOn(EntityTypeConstrainsLinksOn, Option<u32>),
    EntityTypeConstrainsLinkDestinationsOn(EntityTypeConstrainsLinkDestinationsOn, Option<u32>),
    EntityIsOfType(EntityIsOfType, Option<u32>),
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

impl From<EntityEditionCache> for Column {
    fn from(column: EntityEditionCache) -> Self {
        Self::EntityEditionCache(column)
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
            Self::EntityEditionCache(_) => Table::EntityEditionCache,
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
            | Self::EntityEditionCache(_)
            | Self::EntityEmbeddings(_)
            | Self::PropertyTypeConstrainsValuesOn(_)
            | Self::PropertyTypeConstrainsPropertiesOn(_)
            | Self::EntityHasLeftEntity(_)
            | Self::EntityHasRightEntity(_) => None,
        }
    }
}

impl DatabaseColumn for Column {
    fn as_str(&self) -> &str {
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
            Self::EntityEditionCache(column) => column.as_str(),
            Self::EntityEmbeddings(column) => column.as_str(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.as_str(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.as_str(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.as_str(),
            Self::EntityTypeInheritsFrom(column, _) => column.as_str(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.as_str(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.as_str(),
            Self::EntityIsOfType(column, _) => column.as_str(),
            Self::EntityHasLeftEntity(column) => column.as_str(),
            Self::EntityHasRightEntity(column) => column.as_str(),
        }
    }

    fn postgres_type(&self) -> PostgresType {
        match self {
            Self::OntologyIds(column) => column.postgres_type(),
            Self::OntologyTemporalMetadata(column) => column.postgres_type(),
            Self::OntologyOwnedMetadata(column) => column.postgres_type(),
            Self::OntologyExternalMetadata(column) => column.postgres_type(),
            Self::OntologyAdditionalMetadata(column) => column.postgres_type(),
            Self::DataTypes(column) => column.postgres_type(),
            Self::DataTypeEmbeddings(column) => column.postgres_type(),
            Self::DataTypeInheritsFrom(column, _) => column.postgres_type(),
            Self::DataTypeConversions(column) => column.postgres_type(),
            Self::DataTypeConversionAggregation(column) => column.postgres_type(),
            Self::PropertyTypes(column) => column.postgres_type(),
            Self::PropertyTypeEmbeddings(column) => column.postgres_type(),
            Self::EntityTypes(column) => column.postgres_type(),
            Self::EntityTypeEmbeddings(column) => column.postgres_type(),
            Self::EntityIds(column) => column.postgres_type(),
            Self::EntityTemporalMetadata(column) => column.postgres_type(),
            Self::EntityEditions(column) => column.postgres_type(),
            Self::EntityEditionCache(column) => column.postgres_type(),
            Self::EntityEmbeddings(column) => column.postgres_type(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.postgres_type(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.postgres_type(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.postgres_type(),
            Self::EntityTypeInheritsFrom(column, _) => column.postgres_type(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.postgres_type(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.postgres_type(),
            Self::EntityIsOfType(column, _) => column.postgres_type(),
            Self::EntityHasLeftEntity(column) => column.postgres_type(),
            Self::EntityHasRightEntity(column) => column.postgres_type(),
        }
    }
}

impl FilterColumn for Column {
    fn parameter_type(&self) -> ParameterType {
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
            Self::EntityEditionCache(column) => column.parameter_type(),
            Self::EntityEmbeddings(column) => column.parameter_type(),
            Self::PropertyTypeConstrainsValuesOn(column) => column.parameter_type(),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.parameter_type(),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => column.parameter_type(),
            Self::EntityTypeInheritsFrom(column, _) => column.parameter_type(),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.parameter_type(),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => column.parameter_type(),
            Self::EntityIsOfType(column, _) => column.parameter_type(),
            Self::EntityHasLeftEntity(column) => column.parameter_type(),
            Self::EntityHasRightEntity(column) => column.parameter_type(),
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
    EntityIds,
    EntityEditions,
    EntityEditionCache,
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
    #[must_use]
    pub const fn join_type(self) -> JoinType {
        match self {
            Self::Single { join_type, .. } | Self::Double { join_type, .. } => join_type,
        }
    }

    #[must_use]
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

    #[must_use]
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
    /// Whether joining this relation can multiply the number of base rows (fan-out).
    ///
    /// Conservative: only relations that join on a unique/primary key — exactly one joined
    /// row per base row — return `false`. Everything else (edge traversals via
    /// [`Self::Reference`], link endpoints, embeddings) returns `true`. Adding a new relation
    /// therefore defaults to `true` (needs dedup), which is the safe direction.
    ///
    /// Used to decide whether a downstream `DISTINCT` is required: a query whose joins are all
    /// to-one cannot emit duplicate base rows, so the dedup can be skipped.
    #[must_use]
    pub const fn is_to_many(self) -> bool {
        !matches!(
            self,
            Self::OntologyIds
                | Self::OntologyOwnedMetadata
                | Self::OntologyExternalMetadata
                | Self::OntologyAdditionalMetadata
                | Self::DataTypeIds
                | Self::PropertyTypeIds
                | Self::EntityTypeIds
                | Self::EntityIds
                | Self::EntityEditions
                | Self::EntityEditionCache
        )
    }

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
            Self::EntityEditionCache => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                    join: Column::EntityEditionCache(EntityEditionCache::EntityEditionId),
                    join_type: JoinType::Inner,
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
                                    Expression::Constant(Constant::U32(inheritance_depth)),
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
            | Self::EntityIds
            | Self::EntityEditions
            | Self::EntityEditionCache
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
