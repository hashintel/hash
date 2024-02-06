use std::{
    fmt::{self, Debug},
    hash::Hash,
    iter::{once, Chain, Once},
};

use postgres_types::ToSql;
use temporal_versioning::TimeAxis;

use crate::{
    store::{
        postgres::query::{Condition, Constant, Expression, Transpile},
        query::{JsonPath, ParameterType},
    },
    subgraph::edges::EdgeDirection,
};

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Table {
    OntologyIds,
    OntologyTemporalMetadata,
    OntologyOwnedMetadata,
    OntologyExternalMetadata,
    OntologyAdditionalMetadata,
    DataTypes,
    PropertyTypes,
    EntityTypes,
    EntityIds,
    EntityTemporalMetadata,
    EntityEditions,
    EntityEmbeddings,
    Reference(ReferenceTable),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReferenceTable {
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
    pub fn inheritance_depth_column(self) -> Option<Column<'static>> {
        match self {
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth }
                if inheritance_depth != Some(0) =>
            {
                Some(Column::EntityTypeConstrainsPropertiesOn(
                    EntityTypeConstrainsPropertiesOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } if inheritance_depth != Some(0) => {
                Some(Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityTypeConstrainsLinksOn { inheritance_depth }
                if inheritance_depth != Some(0) =>
            {
                Some(Column::EntityTypeConstrainsLinksOn(
                    EntityTypeConstrainsLinksOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth }
                if inheritance_depth != Some(0) =>
            {
                Some(Column::EntityTypeConstrainsLinkDestinationsOn(
                    EntityTypeConstrainsLinkDestinationsOn::InheritanceDepth,
                    inheritance_depth,
                ))
            }
            Self::EntityIsOfType { inheritance_depth } if inheritance_depth != Some(0) => Some(
                Column::EntityIsOfType(EntityIsOfType::InheritanceDepth, inheritance_depth),
            ),
            _ => None,
        }
    }

    pub const fn source_relation(self) -> ForeignKeyReference {
        match self {
            Self::PropertyTypeConstrainsValuesOn => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypeConstrainsValuesOn(
                    PropertyTypeConstrainsValuesOn::SourcePropertyTypeOntologyId,
                ),
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::SourcePropertyTypeOntologyId,
                ),
            },
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsPropertiesOn(
                        EntityTypeConstrainsPropertiesOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                }
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::SourceEntityTypeOntologyId,
                    inheritance_depth,
                ),
            },
            Self::EntityTypeConstrainsLinksOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsLinksOn(
                        EntityTypeConstrainsLinksOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                }
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::EntityTypeConstrainsLinkDestinationsOn(
                        EntityTypeConstrainsLinkDestinationsOn::SourceEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                }
            }
            Self::EntityIsOfType { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfType(EntityIsOfType::EntityEditionId, inheritance_depth),
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
            },
        }
    }

    pub const fn target_relation(self) -> ForeignKeyReference {
        match self {
            Self::PropertyTypeConstrainsValuesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypeConstrainsValuesOn(
                    PropertyTypeConstrainsValuesOn::TargetDataTypeOntologyId,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
            },
            Self::EntityTypeConstrainsPropertiesOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsPropertiesOn(
                        EntityTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                }
            }
            Self::EntityTypeInheritsFrom { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::TargetEntityTypeOntologyId,
                    inheritance_depth,
                ),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
            },
            Self::EntityTypeConstrainsLinksOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsLinksOn(
                        EntityTypeConstrainsLinksOn::TargetEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                }
            }
            Self::EntityTypeConstrainsLinkDestinationsOn { inheritance_depth } => {
                ForeignKeyReference::Single {
                    on: Column::EntityTypeConstrainsLinkDestinationsOn(
                        EntityTypeConstrainsLinkDestinationsOn::TargetEntityTypeOntologyId,
                        inheritance_depth,
                    ),
                    join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                }
            }
            Self::EntityIsOfType { inheritance_depth } => ForeignKeyReference::Single {
                on: Column::EntityIsOfType(EntityIsOfType::EntityTypeOntologyId, inheritance_depth),
                join: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
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
            },
        }
    }
}

impl ReferenceTable {
    const fn as_str(self) -> &'static str {
        match self {
            Self::PropertyTypeConstrainsValuesOn => "property_type_constrains_values_on",
            Self::PropertyTypeConstrainsPropertiesOn => "property_type_constrains_properties_on",
            Self::EntityTypeConstrainsPropertiesOn {
                inheritance_depth: Some(0),
            } => "entity_type_constrains_properties_on",
            Self::EntityTypeConstrainsPropertiesOn { .. } => {
                "closed_entity_type_constrains_properties_on"
            }
            Self::EntityTypeInheritsFrom {
                inheritance_depth: Some(0),
            } => "entity_type_inherits_from",
            Self::EntityTypeInheritsFrom { .. } => "closed_entity_type_inherits_from",
            Self::EntityTypeConstrainsLinksOn {
                inheritance_depth: Some(0),
            } => "entity_type_constrains_links_on",
            Self::EntityTypeConstrainsLinksOn { .. } => "closed_entity_type_constrains_links_on",
            Self::EntityTypeConstrainsLinkDestinationsOn {
                inheritance_depth: Some(0),
            } => "entity_type_constrains_link_destinations_on",
            Self::EntityTypeConstrainsLinkDestinationsOn { .. } => {
                "closed_entity_type_constrains_link_destinations_on"
            }
            Self::EntityIsOfType {
                inheritance_depth: Some(0),
            } => "entity_is_of_type",
            Self::EntityIsOfType { .. } => "closed_entity_is_of_type",
            Self::EntityHasLeftEntity => "entity_has_left_entity",
            Self::EntityHasRightEntity => "entity_has_right_entity",
        }
    }
}

impl Table {
    pub const fn aliased(self, alias: Alias) -> AliasedTable {
        AliasedTable { table: self, alias }
    }

    const fn as_str(self) -> &'static str {
        match self {
            Self::OntologyIds => "ontology_ids",
            Self::OntologyTemporalMetadata => "ontology_temporal_metadata",
            Self::OntologyOwnedMetadata => "ontology_owned_metadata",
            Self::OntologyExternalMetadata => "ontology_external_metadata",
            Self::OntologyAdditionalMetadata => "ontology_additional_metadata",
            Self::DataTypes => "data_types",
            Self::PropertyTypes => "property_types",
            Self::EntityTypes => "entity_types",
            Self::EntityIds => "entity_ids",
            Self::EntityTemporalMetadata => "entity_temporal_metadata",
            Self::EntityEditions => "entity_editions",
            Self::EntityEmbeddings => "entity_embeddings",
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
}

impl<'p> JsonField<'p> {
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
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum StaticJsonField {
    JsonPathParameter(usize),
    StaticText(&'static str),
    StaticJson(&'static str),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyIds {
    OntologyId,
    BaseUrl,
    Version,
    LatestVersion,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyOwnedMetadata {
    OntologyId,
    WebId,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyExternalMetadata {
    OntologyId,
    FetchedAt,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyAdditionalMetadata {
    OntologyId,
    AdditionalMetadata,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyTemporalMetadata {
    OntologyId,
    TransactionTime,
    CreatedById,
    ArchivedById,
}

fn transpile_json_field(
    path: &JsonField<'static>,
    name: &'static str,
    table: &impl Transpile,
    fmt: &mut fmt::Formatter,
) -> fmt::Result {
    match path {
        JsonField::JsonPath(path) => {
            write!(fmt, "jsonb_path_query_first(")?;
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}", {path})"#)
        }
        JsonField::JsonPathParameter(index) => {
            write!(fmt, "jsonb_path_query_first(")?;
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}", ${index}::text::jsonpath)"#)
        }
        JsonField::StaticText(field) => {
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}"->>'{field}'"#)
        }
    }
}

impl OntologyIds {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::BaseUrl => "base_url",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::BaseUrl => ParameterType::Text,
            Self::Version | Self::LatestVersion => ParameterType::OntologyTypeVersion,
        }
    }
}

impl OntologyOwnedMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId | Self::WebId => ParameterType::Uuid,
        }
    }
}

impl OntologyExternalMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::FetchedAt => "fetched_at",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::FetchedAt => ParameterType::Timestamp,
        }
    }
}

impl OntologyAdditionalMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::AdditionalMetadata => "additional_metadata",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::AdditionalMetadata => ParameterType::Object,
        }
    }
}

impl OntologyTemporalMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::TransactionTime => "transaction_time",
            Self::CreatedById => "edition_created_by_id",
            Self::ArchivedById => "edition_archived_by_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId | Self::CreatedById | Self::ArchivedById => ParameterType::Uuid,
            Self::TransactionTime => ParameterType::TimeInterval,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OwnedOntologyMetadata {
    OntologyId,
    WebId,
}

impl OwnedOntologyMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::WebId => "web_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId | Self::WebId => ParameterType::Uuid,
        }
    }
}

macro_rules! impl_ontology_column {
    ($($name:ident),* $(,)?) => {
        $(
            #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
            pub enum $name<'p> {
                OntologyId,
                Schema(Option<JsonField<'p>>),
            }

            impl<'p> $name<'p> {
                pub const fn nullable(self) -> bool {
                    match self {
                        Self::OntologyId => false,
                        Self::Schema(_) => true,
                    }
                }

                pub const fn into_owned(
                    self,
                    current_parameter_index: usize,
                ) -> ($name<'static>, Option<&'p (dyn ToSql + Sync)>) {
                    match self {
                        Self::OntologyId => ($name::OntologyId, None),
                        Self::Schema(None) => ($name::Schema(None), None),
                        Self::Schema(Some(path)) => {
                            let (path, parameter) = path.into_owned(current_parameter_index);
                            ($name::Schema(Some(path)), parameter)
                        }
                    }
                }
            }

            impl $name<'static> {
                fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
                    let column = match self {
                        Self::OntologyId => "ontology_id",
                        Self::Schema(None) => "schema",
                        Self::Schema(Some(path)) => {
                            return transpile_json_field(path, "schema", table, fmt);
                        }
                    };
                    table.transpile(fmt)?;
                    write!(fmt, r#"."{column}""#)
                }

                pub const fn parameter_type(self) -> ParameterType {
                    match self {
                        Self::OntologyId => ParameterType::Uuid,
                        Self::Schema(Some(JsonField::StaticText(_))) => ParameterType::Text,
                        Self::Schema(_) => ParameterType::Any,
                    }
                }
            }
        )*
    };
}

impl_ontology_column!(DataTypes);
impl_ontology_column!(PropertyTypes);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypes<'p> {
    OntologyId,
    Schema(Option<JsonField<'p>>),
    ClosedSchema(Option<JsonField<'p>>),
    LabelProperty,
    Icon,
}
impl<'p> EntityTypes<'p> {
    pub const fn nullable(self) -> bool {
        match self {
            Self::OntologyId | Self::Schema(None) | Self::ClosedSchema(None) => false,
            Self::Schema(Some(_))
            | Self::ClosedSchema(Some(_))
            | Self::LabelProperty
            | Self::Icon => true,
        }
    }

    pub const fn into_owned(
        self,
        current_parameter_index: usize,
    ) -> (EntityTypes<'static>, Option<&'p (dyn ToSql + Sync)>) {
        match self {
            Self::OntologyId => (EntityTypes::OntologyId, None),
            Self::Schema(None) => (EntityTypes::Schema(None), None),
            Self::Schema(Some(path)) => {
                let (path, parameter) = path.into_owned(current_parameter_index);
                (EntityTypes::Schema(Some(path)), parameter)
            }
            Self::ClosedSchema(None) => (EntityTypes::ClosedSchema(None), None),
            Self::ClosedSchema(Some(path)) => {
                let (path, parameter) = path.into_owned(current_parameter_index);
                (EntityTypes::ClosedSchema(Some(path)), parameter)
            }
            Self::LabelProperty => (EntityTypes::LabelProperty, None),
            Self::Icon => (EntityTypes::Icon, None),
        }
    }
}
impl EntityTypes<'static> {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::Schema(None) => "schema",
            Self::Schema(Some(path)) => {
                return transpile_json_field(path, "schema", table, fmt);
            }
            Self::ClosedSchema(None) => "closed_schema",
            Self::ClosedSchema(Some(path)) => {
                return transpile_json_field(path, "closed_schema", table, fmt);
            }
            Self::LabelProperty => "label_property",
            Self::Icon => "icon",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyId => ParameterType::Uuid,
            Self::Schema(Some(JsonField::StaticText(_))) | Self::Icon => ParameterType::Text,
            Self::Schema(_) | Self::ClosedSchema(_) => ParameterType::Any,
            Self::LabelProperty => ParameterType::BaseUrl,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIds {
    WebId,
    EntityUuid,
    CreatedById,
    CreatedAtDecisionTime,
    CreatedAtTransactionTime,
}

impl EntityIds {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::CreatedById => "created_by_id",
            Self::CreatedAtDecisionTime => "created_at_decision_time",
            Self::CreatedAtTransactionTime => "created_at_transaction_time",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::CreatedById => ParameterType::Uuid,
            Self::CreatedAtDecisionTime | Self::CreatedAtTransactionTime => {
                ParameterType::Timestamp
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTemporalMetadata {
    WebId,
    EntityUuid,
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

    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::EditionId => "entity_edition_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::EditionId => ParameterType::Uuid,
            Self::DecisionTime | Self::TransactionTime => ParameterType::TimeInterval,
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

impl EntityEmbeddings {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::Embedding => "embedding",
            Self::Property => "property",
            Self::UpdatedAtDecisionTime => "updated_at_decision_time",
            Self::UpdatedAtTransactionTime => "updated_at_transaction_time",
            Self::Distance => "distance",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid => ParameterType::Uuid,
            Self::Embedding => ParameterType::Vector,
            Self::Property => ParameterType::BaseUrl,
            Self::UpdatedAtTransactionTime | Self::UpdatedAtDecisionTime => {
                ParameterType::Timestamp
            }
            Self::Distance => ParameterType::F64,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEditions<'p> {
    EditionId,
    Properties(Option<JsonField<'p>>),
    LeftToRightOrder,
    RightToLeftOrder,
    EditionCreatedById,
    Archived,
    Draft,
}

impl<'p> EntityEditions<'p> {
    pub const fn nullable(self) -> bool {
        match self {
            Self::EditionId | Self::Archived | Self::Draft | Self::EditionCreatedById => false,
            Self::Properties(_) | Self::LeftToRightOrder | Self::RightToLeftOrder => true,
        }
    }

    pub const fn into_owned(
        self,
        current_parameter_index: usize,
    ) -> (EntityEditions<'static>, Option<&'p (dyn ToSql + Sync)>) {
        match self {
            Self::EditionId => (EntityEditions::EditionId, None),
            Self::LeftToRightOrder => (EntityEditions::LeftToRightOrder, None),
            Self::RightToLeftOrder => (EntityEditions::RightToLeftOrder, None),
            Self::EditionCreatedById => (EntityEditions::EditionCreatedById, None),
            Self::Archived => (EntityEditions::Archived, None),
            Self::Draft => (EntityEditions::Draft, None),
            Self::Properties(None) => (EntityEditions::Properties(None), None),
            Self::Properties(Some(path)) => {
                let (path, parameter) = path.into_owned(current_parameter_index);
                (EntityEditions::Properties(Some(path)), parameter)
            }
        }
    }
}

impl EntityEditions<'static> {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EditionId => "entity_edition_id",
            Self::Properties(None) => "properties",
            Self::Properties(Some(path)) => {
                return transpile_json_field(path, "properties", table, fmt);
            }
            Self::LeftToRightOrder => "left_to_right_order",
            Self::RightToLeftOrder => "right_to_left_order",
            Self::EditionCreatedById => "edition_created_by_id",
            Self::Archived => "archived",
            Self::Draft => "draft",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::EditionId | Self::EditionCreatedById => ParameterType::Uuid,
            Self::Properties(_) => ParameterType::Any,
            Self::LeftToRightOrder | Self::RightToLeftOrder => ParameterType::I32,
            Self::Archived | Self::Draft => ParameterType::Boolean,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIsOfType {
    EntityEditionId,
    EntityTypeOntologyId,
    InheritanceDepth,
}

impl EntityIsOfType {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
            Self::InheritanceDepth => "inheritance_depth",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::EntityEditionId | Self::EntityTypeOntologyId => ParameterType::Uuid,
            Self::InheritanceDepth => ParameterType::I32,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasLeftEntity {
    WebId,
    EntityUuid,
    LeftEntityWebId,
    LeftEntityUuid,
}

impl EntityHasLeftEntity {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::LeftEntityWebId => "left_web_id",
            Self::LeftEntityUuid => "left_entity_uuid",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::LeftEntityWebId | Self::LeftEntityUuid => {
                ParameterType::Uuid
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasRightEntity {
    WebId,
    EntityUuid,
    RightEntityWebId,
    RightEntityUuid,
}

impl EntityHasRightEntity {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::WebId => "web_id",
            Self::EntityUuid => "entity_uuid",
            Self::RightEntityWebId => "right_web_id",
            Self::RightEntityUuid => "right_entity_uuid",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::WebId | Self::EntityUuid | Self::RightEntityWebId | Self::RightEntityUuid => {
                ParameterType::Uuid
            }
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeConstrainsValuesOn {
    SourcePropertyTypeOntologyId,
    TargetDataTypeOntologyId,
}

impl PropertyTypeConstrainsValuesOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
                Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
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

impl PropertyTypeConstrainsPropertiesOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
                Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
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

impl EntityTypeConstrainsPropertiesOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
                Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
                Self::InheritanceDepth => "inheritance_depth",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetPropertyTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::I32,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeInheritsFrom {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    InheritanceDepth,
}

impl EntityTypeInheritsFrom {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
                Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
                Self::InheritanceDepth => "inheritance_depth",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::I32,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinksOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    InheritanceDepth,
}

impl EntityTypeConstrainsLinksOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
                Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
                Self::InheritanceDepth => "inheritance_depth",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::I32,
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinkDestinationsOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
    InheritanceDepth,
}

impl EntityTypeConstrainsLinkDestinationsOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(
            fmt,
            r#"."{}""#,
            match self {
                Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
                Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
                Self::InheritanceDepth => "inheritance_depth",
            }
        )
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::SourceEntityTypeOntologyId | Self::TargetEntityTypeOntologyId => {
                ParameterType::Uuid
            }
            Self::InheritanceDepth => ParameterType::I32,
        }
    }
}

/// A column in the database.
///
/// If a second parameter is present, it represents the inheritance depths parameter for that view.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Column<'p> {
    OntologyIds(OntologyIds),
    OntologyTemporalMetadata(OntologyTemporalMetadata),
    OntologyOwnedMetadata(OntologyOwnedMetadata),
    OntologyExternalMetadata(OntologyExternalMetadata),
    OntologyAdditionalMetadata(OntologyAdditionalMetadata),
    DataTypes(DataTypes<'p>),
    PropertyTypes(PropertyTypes<'p>),
    EntityTypes(EntityTypes<'p>),
    EntityIds(EntityIds),
    EntityTemporalMetadata(EntityTemporalMetadata),
    EntityEditions(EntityEditions<'p>),
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

impl<'p> Column<'p> {
    pub const fn table(self) -> Table {
        match self {
            Self::OntologyIds(_) => Table::OntologyIds,
            Self::OntologyTemporalMetadata(_) => Table::OntologyTemporalMetadata,
            Self::OntologyOwnedMetadata(_) => Table::OntologyOwnedMetadata,
            Self::OntologyExternalMetadata(_) => Table::OntologyExternalMetadata,
            Self::OntologyAdditionalMetadata(_) => Table::OntologyAdditionalMetadata,
            Self::DataTypes(_) => Table::DataTypes,
            Self::PropertyTypes(_) => Table::PropertyTypes,
            Self::EntityTypes(_) => Table::EntityTypes,
            Self::EntityIds(_) => Table::EntityIds,
            Self::EntityTemporalMetadata(_) => Table::EntityTemporalMetadata,
            Self::EntityEditions(_) => Table::EntityEditions,
            Self::EntityEmbeddings(_) => Table::EntityEmbeddings,
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

    pub const fn inheritance_depth(self) -> Option<u32> {
        match self {
            Self::EntityTypeInheritsFrom(_, inheritance_depth)
            | Self::EntityTypeConstrainsPropertiesOn(_, inheritance_depth)
            | Self::EntityTypeConstrainsLinksOn(_, inheritance_depth)
            | Self::EntityTypeConstrainsLinkDestinationsOn(_, inheritance_depth)
            | Self::EntityIsOfType(_, inheritance_depth) => inheritance_depth,
            _ => None,
        }
    }

    pub const fn nullable(self) -> bool {
        match self {
            Self::DataTypes(column) => column.nullable(),
            Self::PropertyTypes(column) => column.nullable(),
            Self::EntityTypes(column) => column.nullable(),
            Self::EntityEditions(column) => column.nullable(),
            Self::EntityEmbeddings(_)
            | Self::EntityHasLeftEntity(_)
            | Self::EntityHasRightEntity(_)
            | Self::OntologyOwnedMetadata(_)
            | Self::OntologyExternalMetadata(_) => true,
            _ => false,
        }
    }

    pub const fn into_owned(
        self,
        current_parameter_index: usize,
    ) -> (Column<'static>, Option<&'p (dyn ToSql + Sync)>) {
        match self {
            Self::OntologyIds(column) => (Column::OntologyIds(column), None),
            Self::OntologyTemporalMetadata(column) => {
                (Column::OntologyTemporalMetadata(column), None)
            }
            Self::OntologyOwnedMetadata(column) => (Column::OntologyOwnedMetadata(column), None),
            Self::OntologyExternalMetadata(column) => {
                (Column::OntologyExternalMetadata(column), None)
            }
            Self::OntologyAdditionalMetadata(column) => {
                (Column::OntologyAdditionalMetadata(column), None)
            }
            Self::DataTypes(column) => {
                let (column, parameter) = column.into_owned(current_parameter_index);
                (Column::DataTypes(column), parameter)
            }
            Self::PropertyTypes(column) => {
                let (column, parameter) = column.into_owned(current_parameter_index);
                (Column::PropertyTypes(column), parameter)
            }
            Self::EntityTypes(column) => {
                let (column, parameter) = column.into_owned(current_parameter_index);
                (Column::EntityTypes(column), parameter)
            }
            Self::EntityIds(column) => (Column::EntityIds(column), None),
            Self::EntityTemporalMetadata(column) => (Column::EntityTemporalMetadata(column), None),
            Self::EntityEditions(column) => {
                let (column, parameter) = column.into_owned(current_parameter_index);
                (Column::EntityEditions(column), parameter)
            }
            Self::EntityEmbeddings(column) => (Column::EntityEmbeddings(column), None),
            Self::PropertyTypeConstrainsValuesOn(column) => {
                (Column::PropertyTypeConstrainsValuesOn(column), None)
            }
            Self::PropertyTypeConstrainsPropertiesOn(column) => {
                (Column::PropertyTypeConstrainsPropertiesOn(column), None)
            }
            Self::EntityTypeConstrainsPropertiesOn(column, inheritance_depth) => (
                Column::EntityTypeConstrainsPropertiesOn(column, inheritance_depth),
                None,
            ),
            Self::EntityTypeInheritsFrom(column, inheritance_depth) => (
                Column::EntityTypeInheritsFrom(column, inheritance_depth),
                None,
            ),
            Self::EntityTypeConstrainsLinksOn(column, inheritance_depth) => (
                Column::EntityTypeConstrainsLinksOn(column, inheritance_depth),
                None,
            ),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, inheritance_depth) => (
                Column::EntityTypeConstrainsLinkDestinationsOn(column, inheritance_depth),
                None,
            ),
            Self::EntityIsOfType(column, inheritance_depth) => {
                (Column::EntityIsOfType(column, inheritance_depth), None)
            }
            Self::EntityHasLeftEntity(column) => (Column::EntityHasLeftEntity(column), None),
            Self::EntityHasRightEntity(column) => (Column::EntityHasRightEntity(column), None),
        }
    }
}

impl Column<'static> {
    pub const fn aliased(self, alias: Alias) -> AliasedColumn {
        AliasedColumn {
            column: self,
            alias,
        }
    }

    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::OntologyIds(column) => column.transpile_column(table, fmt),
            Self::OntologyTemporalMetadata(column) => column.transpile_column(table, fmt),
            Self::OntologyOwnedMetadata(column) => column.transpile_column(table, fmt),
            Self::OntologyExternalMetadata(column) => column.transpile_column(table, fmt),
            Self::OntologyAdditionalMetadata(column) => column.transpile_column(table, fmt),
            Self::DataTypes(column) => column.transpile_column(table, fmt),
            Self::PropertyTypes(column) => column.transpile_column(table, fmt),
            Self::EntityTypes(column) => column.transpile_column(table, fmt),
            Self::EntityIds(column) => column.transpile_column(table, fmt),
            Self::EntityTemporalMetadata(column) => column.transpile_column(table, fmt),
            Self::EntityEditions(column) => column.transpile_column(table, fmt),
            Self::EntityEmbeddings(column) => column.transpile_column(table, fmt),
            Self::PropertyTypeConstrainsValuesOn(column) => column.transpile_column(table, fmt),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsPropertiesOn(column, _) => {
                column.transpile_column(table, fmt)
            }
            Self::EntityTypeInheritsFrom(column, _) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsLinksOn(column, _) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsLinkDestinationsOn(column, _) => {
                column.transpile_column(table, fmt)
            }
            Self::EntityIsOfType(column, _) => column.transpile_column(table, fmt),
            Self::EntityHasLeftEntity(column) => column.transpile_column(table, fmt),
            Self::EntityHasRightEntity(column) => column.transpile_column(table, fmt),
        }
    }

    pub const fn parameter_type(self) -> ParameterType {
        match self {
            Self::OntologyIds(column) => column.parameter_type(),
            Self::OntologyTemporalMetadata(column) => column.parameter_type(),
            Self::OntologyOwnedMetadata(column) => column.parameter_type(),
            Self::OntologyExternalMetadata(column) => column.parameter_type(),
            Self::OntologyAdditionalMetadata(column) => column.parameter_type(),
            Self::DataTypes(column) => column.parameter_type(),
            Self::PropertyTypes(column) => column.parameter_type(),
            Self::EntityTypes(column) => column.parameter_type(),
            Self::EntityIds(column) => column.parameter_type(),
            Self::EntityTemporalMetadata(column) => column.parameter_type(),
            Self::EntityEditions(column) => column.parameter_type(),
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

impl Transpile for Column<'static> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.transpile_column(&self.table(), fmt)
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
/// [`DataType`]: type_system::DataType
/// [`PropertyType`]: type_system::PropertyType
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct Alias {
    pub condition_index: usize,
    pub chain_depth: usize,
    pub number: usize,
}

/// A table available in a compiled query.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AliasedTable {
    pub table: Table,
    pub alias: Alias,
}

impl Transpile for AliasedTable {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(
            fmt,
            r#""{}_{}_{}_{}""#,
            self.table.as_str(),
            self.alias.condition_index,
            self.alias.chain_depth,
            self.alias.number
        )
    }
}

/// A column available in the statement.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AliasedColumn {
    pub column: Column<'static>,
    pub alias: Alias,
}

impl AliasedColumn {
    pub const fn table(&self) -> AliasedTable {
        self.column.table().aliased(self.alias)
    }
}

impl Transpile for AliasedColumn {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.column.transpile_column(&self.table(), fmt)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Relation {
    OntologyIds,
    OntologyOwnedMetadata,
    OntologyExternalMetadata,
    OntologyAdditionalMetadata,
    DataTypeIds,
    PropertyTypeIds,
    EntityTypeIds,
    EntityIds,
    EntityEditions,
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
        on: Column<'static>,
        join: Column<'static>,
    },
    Double {
        on: [Column<'static>; 2],
        join: [Column<'static>; 2],
    },
}

impl ForeignKeyReference {
    pub const fn reverse(self) -> Self {
        match self {
            Self::Single { on, join } => Self::Single { on: join, join: on },
            Self::Double { on, join } => Self::Double { on: join, join: on },
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
    pub fn joins(self) -> ForeignKeyJoin {
        match self {
            Self::OntologyIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }),
            Self::OntologyOwnedMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyOwnedMetadata(OntologyOwnedMetadata::OntologyId),
                })
            }
            Self::OntologyExternalMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyExternalMetadata(OntologyExternalMetadata::OntologyId),
                })
            }
            Self::OntologyAdditionalMetadata => {
                ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                    on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                    join: Column::OntologyAdditionalMetadata(
                        OntologyAdditionalMetadata::OntologyId,
                    ),
                })
            }
            Self::DataTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::DataTypes(DataTypes::OntologyId),
            }),
            Self::PropertyTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::PropertyTypes(PropertyTypes::OntologyId),
            }),
            Self::EntityTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::OntologyTemporalMetadata(OntologyTemporalMetadata::OntologyId),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            }),
            Self::EntityIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityIds(EntityIds::WebId),
                    Column::EntityIds(EntityIds::EntityUuid),
                ],
            }),
            Self::EntityEditions => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityEditions(EntityEditions::EditionId),
            }),
            Self::EntityEmbeddings => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::WebId),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityEmbeddings(EntityEmbeddings::WebId),
                    Column::EntityEmbeddings(EntityEmbeddings::EntityUuid),
                ],
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
            }),
            Self::Reference {
                table, direction, ..
            } => ForeignKeyJoin::from_reference_table(table, direction),
        }
    }

    pub fn additional_conditions(self, aliased_table: AliasedTable) -> Vec<Condition> {
        match (self, aliased_table.table) {
            (Self::Reference { table, .. }, Table::Reference(reference_table))
                if table == reference_table =>
            {
                table
                    .inheritance_depth_column()
                    .map(|column| {
                        column
                            .inheritance_depth()
                            .map_or_else(Vec::new, |inheritance_depth| {
                                vec![Condition::LessOrEqual(
                                    Expression::Column(column.aliased(aliased_table.alias)),
                                    Expression::Constant(Constant::UnsignedInteger(
                                        inheritance_depth,
                                    )),
                                )]
                            })
                    })
                    .unwrap_or_default()
            }
            _ => Vec::new(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ontology::DataTypeQueryPath, store::postgres::query::PostgresQueryPath};

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
                .transpile_to_string(),
            r#""data_types"."ontology_id""#
        );
        assert_eq!(
            DataTypeQueryPath::Title
                .terminating_column()
                .transpile_to_string(),
            r#""data_types"."schema"->>'title'"#
        );
    }

    #[test]
    fn transpile_aliased_column() {
        let alias = Alias {
            condition_index: 1,
            chain_depth: 2,
            number: 3,
        };

        assert_eq!(
            DataTypeQueryPath::OntologyId
                .terminating_column()
                .aliased(alias)
                .transpile_to_string(),
            r#""data_types_1_2_3"."ontology_id""#
        );
        assert_eq!(
            DataTypeQueryPath::Title
                .terminating_column()
                .aliased(alias)
                .transpile_to_string(),
            r#""data_types_1_2_3"."schema"->>'title'"#
        );
    }
}
