use std::{
    borrow::Cow,
    fmt::{self, Debug},
    hash::Hash,
    iter::{once, Chain, Once},
};

use crate::{
    identifier::time::TimeAxis,
    store::{postgres::query::Transpile, query::JsonPath},
    subgraph::edges::EdgeDirection,
};

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Table {
    OntologyIds,
    DataTypes,
    PropertyTypes,
    EntityTypes,
    EntityTemporalMetadata,
    EntityEditions,
    Reference(ReferenceTable),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum ReferenceTable {
    PropertyTypeConstrainsValuesOn,
    PropertyTypeConstrainsPropertiesOn,
    EntityTypeConstrainsPropertiesOn,
    EntityTypeInheritsFrom,
    EntityTypeConstrainsLinksOn,
    EntityTypeConstrainsLinkDestinationsOn,
    EntityIsOfType,
    EntityHasLeftEntity,
    EntityHasRightEntity,
}

impl ReferenceTable {
    pub const fn source_relation(self) -> ForeignKeyReference {
        match self {
            Self::PropertyTypeConstrainsValuesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypes(PropertyTypes::OntologyId),
                join: Column::PropertyTypeConstrainsValuesOn(
                    PropertyTypeConstrainsValuesOn::SourcePropertyTypeOntologyId,
                ),
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypes(PropertyTypes::OntologyId),
                join: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::SourcePropertyTypeOntologyId,
                ),
            },
            Self::EntityTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::EntityTypeConstrainsPropertiesOn(
                    EntityTypeConstrainsPropertiesOn::SourceEntityTypeOntologyId,
                ),
            },
            Self::EntityTypeInheritsFrom => ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::SourceEntityTypeOntologyId,
                ),
            },
            Self::EntityTypeConstrainsLinksOn => ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::EntityTypeConstrainsLinksOn(
                    EntityTypeConstrainsLinksOn::SourceEntityTypeOntologyId,
                ),
            },
            Self::EntityTypeConstrainsLinkDestinationsOn => ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::EntityTypeConstrainsLinkDestinationsOn(
                    EntityTypeConstrainsLinkDestinationsOn::SourceEntityTypeOntologyId,
                ),
            },
            Self::EntityIsOfType => ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityIsOfType(EntityIsOfType::EntityEditionId),
            },
            Self::EntityHasLeftEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::OwnedById),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::EntityUuid),
                ],
            },
            Self::EntityHasRightEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::OwnedById),
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
                join: Column::DataTypes(DataTypes::OntologyId),
            },
            Self::PropertyTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::PropertyTypeConstrainsPropertiesOn(
                    PropertyTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                ),
                join: Column::PropertyTypes(PropertyTypes::OntologyId),
            },
            Self::EntityTypeConstrainsPropertiesOn => ForeignKeyReference::Single {
                on: Column::EntityTypeConstrainsPropertiesOn(
                    EntityTypeConstrainsPropertiesOn::TargetPropertyTypeOntologyId,
                ),
                join: Column::PropertyTypes(PropertyTypes::OntologyId),
            },
            Self::EntityTypeInheritsFrom => ForeignKeyReference::Single {
                on: Column::EntityTypeInheritsFrom(
                    EntityTypeInheritsFrom::TargetEntityTypeOntologyId,
                ),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            },
            Self::EntityTypeConstrainsLinksOn => ForeignKeyReference::Single {
                on: Column::EntityTypeConstrainsLinksOn(
                    EntityTypeConstrainsLinksOn::TargetEntityTypeOntologyId,
                ),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            },
            Self::EntityTypeConstrainsLinkDestinationsOn => ForeignKeyReference::Single {
                on: Column::EntityTypeConstrainsLinkDestinationsOn(
                    EntityTypeConstrainsLinkDestinationsOn::TargetEntityTypeOntologyId,
                ),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            },
            Self::EntityIsOfType => ForeignKeyReference::Single {
                on: Column::EntityIsOfType(EntityIsOfType::EntityTypeOntologyId),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            },
            Self::EntityHasLeftEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityOwnedById),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::LeftEntityUuid),
                ],
                join: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
            },
            Self::EntityHasRightEntity => ForeignKeyReference::Double {
                on: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityOwnedById),
                    Column::EntityHasRightEntity(EntityHasRightEntity::RightEntityUuid),
                ],
                join: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
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
            Self::EntityTypeConstrainsPropertiesOn => "entity_type_constrains_properties_on",
            Self::EntityTypeInheritsFrom => "entity_type_inherits_from",
            Self::EntityTypeConstrainsLinksOn => "entity_type_constrains_links_on",
            Self::EntityTypeConstrainsLinkDestinationsOn => {
                "entity_type_constrains_link_destinations_on"
            }
            Self::EntityIsOfType => "entity_is_of_type",
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
            Self::OntologyIds => "ontology_id_with_metadata",
            Self::DataTypes => "data_types",
            Self::PropertyTypes => "property_types",
            Self::EntityTypes => "entity_types",
            Self::EntityTemporalMetadata => "entity_temporal_metadata",
            Self::EntityEditions => "entity_editions",
            Self::Reference(table) => table.as_str(),
        }
    }
}

impl Transpile for Table {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, r#""{}""#, self.as_str())
    }
}

// TODO: We should add another enum to only contain variants, which may be passed as parameters,
//       so the lifetime of that struct will be `'static`.
//   see https://app.asana.com/0/0/1203821263193164/f
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JsonField<'p> {
    Json(&'p Cow<'p, str>),
    JsonPath(&'p JsonPath<'p>),
    JsonPathParameter(usize),
    StaticText(&'static str),
    StaticJson(&'static str),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyIds<'p> {
    OntologyId,
    BaseUrl,
    Version,
    RecordCreatedById,
    LatestVersion,
    TransactionTime,
    AdditionalMetadata(Option<JsonField<'p>>),
}

fn transpile_json_field(
    path: &JsonField,
    name: &'static str,
    table: &impl Transpile,
    fmt: &mut fmt::Formatter,
) -> fmt::Result {
    match path {
        JsonField::Json(field) => panic!(
            "attempting to access JSON field `{field}` on `{name}` column without preparing the \
             value"
        ),
        JsonField::JsonPath(path) => panic!(
            "attempting to access JSON path `{path}` on `{name}` column without preparing the \
             value"
        ),
        JsonField::JsonPathParameter(index) => {
            write!(fmt, "jsonb_path_query_first(")?;
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}", ${index}::text::jsonpath)"#)
        }
        JsonField::StaticText(field) => {
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}"->>'{field}'"#)
        }
        JsonField::StaticJson(field) => {
            table.transpile(fmt)?;
            write!(fmt, r#"."{name}"->'{field}'"#)
        }
    }
}

impl OntologyIds<'_> {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::BaseUrl => "base_url",
            Self::TransactionTime => "transaction_time",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
            Self::RecordCreatedById => "record_created_by_id",
            Self::AdditionalMetadata(None) => "additional_metadata",
            Self::AdditionalMetadata(Some(path)) => {
                return transpile_json_field(path, "additional_metadata", table, fmt);
            }
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OwnedOntologyMetadata {
    OntologyId,
    OwnedById,
}

impl OwnedOntologyMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::OwnedById => "owned_by_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
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

            impl $name<'_> {
                pub const fn nullable(self) -> bool {
                    match self {
                        Self::OntologyId => false,
                        Self::Schema(_) => true,
                    }
                }
            }

            impl $name<'_> {
                fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
                    let column = match self {
                        Self::OntologyId => "ontology_id",
                        Self::Schema(None) => "schema",
                        Self::Schema(Some(path)) => {
                            return transpile_json_field(path, "schema", table, fmt);
                        }
                    };
                    table.transpile(fmt)?;
                    write!(fmt, r#"."{}""#, column)
                }
            }
        )*
    };
}

impl_ontology_column!(DataTypes);
impl_ontology_column!(PropertyTypes);
impl_ontology_column!(EntityTypes);

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTemporalMetadata {
    OwnedById,
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
}

impl EntityTemporalMetadata {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OwnedById => "owned_by_id",
            Self::EntityUuid => "entity_uuid",
            Self::EditionId => "entity_edition_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityEditions<'p> {
    EditionId,
    Properties(Option<JsonField<'p>>),
    LeftToRightOrder,
    RightToLeftOrder,
    RecordCreatedById,
    Archived,
}

impl EntityEditions<'_> {
    pub const fn nullable(self) -> bool {
        match self {
            Self::EditionId | Self::Archived | Self::RecordCreatedById => false,
            Self::Properties(_) | Self::LeftToRightOrder | Self::RightToLeftOrder => true,
        }
    }
}

impl EntityEditions<'_> {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EditionId => "entity_edition_id",
            Self::Properties(None) => "properties",
            Self::Properties(Some(path)) => {
                return transpile_json_field(path, "properties", table, fmt);
            }
            Self::LeftToRightOrder => "left_to_right_order",
            Self::RightToLeftOrder => "right_to_left_order",
            Self::RecordCreatedById => "record_created_by_id",
            Self::Archived => "archived",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityIsOfType {
    EntityEditionId,
    EntityTypeOntologyId,
}

impl EntityIsOfType {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EntityEditionId => "entity_edition_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasLeftEntity {
    OwnedById,
    EntityUuid,
    LeftEntityOwnedById,
    LeftEntityUuid,
}

impl EntityHasLeftEntity {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OwnedById => "owned_by_id",
            Self::EntityUuid => "entity_uuid",
            Self::LeftEntityOwnedById => "left_owned_by_id",
            Self::LeftEntityUuid => "left_entity_uuid",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityHasRightEntity {
    OwnedById,
    EntityUuid,
    RightEntityOwnedById,
    RightEntityUuid,
}

impl EntityHasRightEntity {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OwnedById => "owned_by_id",
            Self::EntityUuid => "entity_uuid",
            Self::RightEntityOwnedById => "right_owned_by_id",
            Self::RightEntityUuid => "right_entity_uuid",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
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
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
        })
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
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsPropertiesOn {
    SourceEntityTypeOntologyId,
    TargetPropertyTypeOntologyId,
}

impl EntityTypeConstrainsPropertiesOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeInheritsFrom {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
}

impl EntityTypeInheritsFrom {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinksOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
}

impl EntityTypeConstrainsLinksOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeConstrainsLinkDestinationsOn {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
}

impl EntityTypeConstrainsLinkDestinationsOn {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Column<'p> {
    OntologyIds(OntologyIds<'p>),
    DataTypes(DataTypes<'p>),
    PropertyTypes(PropertyTypes<'p>),
    EntityTypes(EntityTypes<'p>),
    EntityTemporalMetadata(EntityTemporalMetadata),
    EntityEditions(EntityEditions<'p>),
    PropertyTypeConstrainsValuesOn(PropertyTypeConstrainsValuesOn),
    PropertyTypeConstrainsPropertiesOn(PropertyTypeConstrainsPropertiesOn),
    EntityTypeConstrainsPropertiesOn(EntityTypeConstrainsPropertiesOn),
    EntityTypeInheritsFrom(EntityTypeInheritsFrom),
    EntityTypeConstrainsLinksOn(EntityTypeConstrainsLinksOn),
    EntityTypeConstrainsLinkDestinationsOn(EntityTypeConstrainsLinkDestinationsOn),
    EntityIsOfType(EntityIsOfType),
    EntityHasLeftEntity(EntityHasLeftEntity),
    EntityHasRightEntity(EntityHasRightEntity),
}

impl<'p> Column<'p> {
    pub const fn table(self) -> Table {
        match self {
            Self::OntologyIds(_) => Table::OntologyIds,
            Self::DataTypes(_) => Table::DataTypes,
            Self::PropertyTypes(_) => Table::PropertyTypes,
            Self::EntityTypes(_) => Table::EntityTypes,
            Self::EntityTemporalMetadata(_) => Table::EntityTemporalMetadata,
            Self::EntityEditions(_) => Table::EntityEditions,
            Self::PropertyTypeConstrainsValuesOn(_) => {
                Table::Reference(ReferenceTable::PropertyTypeConstrainsValuesOn)
            }
            Self::PropertyTypeConstrainsPropertiesOn(_) => {
                Table::Reference(ReferenceTable::PropertyTypeConstrainsPropertiesOn)
            }
            Self::EntityTypeConstrainsPropertiesOn(_) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsPropertiesOn)
            }
            Self::EntityTypeInheritsFrom(_) => {
                Table::Reference(ReferenceTable::EntityTypeInheritsFrom)
            }
            Self::EntityTypeConstrainsLinksOn(_) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsLinksOn)
            }
            Self::EntityTypeConstrainsLinkDestinationsOn(_) => {
                Table::Reference(ReferenceTable::EntityTypeConstrainsLinkDestinationsOn)
            }
            Self::EntityIsOfType(_) => Table::Reference(ReferenceTable::EntityIsOfType),
            Self::EntityHasLeftEntity(_) => Table::Reference(ReferenceTable::EntityHasLeftEntity),
            Self::EntityHasRightEntity(_) => Table::Reference(ReferenceTable::EntityHasRightEntity),
        }
    }

    pub const fn nullable(self) -> bool {
        match self {
            Self::DataTypes(column) => column.nullable(),
            Self::PropertyTypes(column) => column.nullable(),
            Self::EntityTypes(column) => column.nullable(),
            Self::EntityEditions(column) => column.nullable(),
            Self::EntityHasLeftEntity(_) | Self::EntityHasRightEntity(_) => true,
            _ => false,
        }
    }

    pub const fn aliased(self, alias: Alias) -> AliasedColumn<'p> {
        AliasedColumn {
            column: self,
            alias,
        }
    }

    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::OntologyIds(column) => column.transpile_column(table, fmt),
            Self::DataTypes(column) => column.transpile_column(table, fmt),
            Self::PropertyTypes(column) => column.transpile_column(table, fmt),
            Self::EntityTypes(column) => column.transpile_column(table, fmt),
            Self::EntityTemporalMetadata(column) => column.transpile_column(table, fmt),
            Self::EntityEditions(column) => column.transpile_column(table, fmt),
            Self::PropertyTypeConstrainsValuesOn(column) => column.transpile_column(table, fmt),
            Self::PropertyTypeConstrainsPropertiesOn(column) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsPropertiesOn(column) => column.transpile_column(table, fmt),
            Self::EntityTypeInheritsFrom(column) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsLinksOn(column) => column.transpile_column(table, fmt),
            Self::EntityTypeConstrainsLinkDestinationsOn(column) => {
                column.transpile_column(table, fmt)
            }
            Self::EntityIsOfType(column) => column.transpile_column(table, fmt),
            Self::EntityHasLeftEntity(column) => column.transpile_column(table, fmt),
            Self::EntityHasRightEntity(column) => column.transpile_column(table, fmt),
        }
    }
}

impl Transpile for Column<'_> {
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
pub struct AliasedColumn<'param> {
    pub column: Column<'param>,
    pub alias: Alias,
}

impl AliasedColumn<'_> {
    pub const fn table(&self) -> AliasedTable {
        self.column.table().aliased(self.alias)
    }
}

impl Transpile for AliasedColumn<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.column.transpile_column(&self.table(), fmt)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Relation {
    DataTypeIds,
    PropertyTypeIds,
    EntityTypeIds,
    EntityEditions,
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

enum ForeignKeyJoin {
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
    pub fn joins(self) -> impl Iterator<Item = ForeignKeyReference> {
        match self {
            Self::DataTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::DataTypes(DataTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }),
            Self::PropertyTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::PropertyTypes(PropertyTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }),
            Self::EntityTypeIds => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }),
            Self::EntityEditions => ForeignKeyJoin::from_reference(ForeignKeyReference::Single {
                on: Column::EntityTemporalMetadata(EntityTemporalMetadata::EditionId),
                join: Column::EntityEditions(EntityEditions::EditionId),
            }),
            Self::LeftEntity => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::OwnedById),
                    Column::EntityHasLeftEntity(EntityHasLeftEntity::EntityUuid),
                ],
            }),
            Self::RightEntity => ForeignKeyJoin::from_reference(ForeignKeyReference::Double {
                on: [
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::OwnedById),
                    Column::EntityTemporalMetadata(EntityTemporalMetadata::EntityUuid),
                ],
                join: [
                    Column::EntityHasRightEntity(EntityHasRightEntity::OwnedById),
                    Column::EntityHasRightEntity(EntityHasRightEntity::EntityUuid),
                ],
            }),
            Self::Reference { table, direction } => {
                ForeignKeyJoin::from_reference_table(table, direction)
            }
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
            r#""ontology_id_with_metadata""#
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
            r#""ontology_id_with_metadata_1_2_3""#
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
