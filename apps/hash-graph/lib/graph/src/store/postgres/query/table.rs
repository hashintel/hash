use std::{
    borrow::Cow,
    fmt::{self, Debug},
    hash::Hash,
};

use crate::{
    identifier::time::TimeAxis,
    store::{postgres::query::Transpile, query::JsonPath},
};

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Table {
    OntologyIds,
    DataTypes,
    PropertyTypes,
    EntityTypes,
    Entities,
    PropertyTypeDataTypeReferences,
    PropertyTypePropertyTypeReferences,
    EntityTypePropertyTypeReferences,
    EntityTypeEntityTypeReferences,
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
            Self::Entities => "entities",
            Self::PropertyTypeDataTypeReferences => "property_type_data_type_references",
            Self::PropertyTypePropertyTypeReferences => "property_type_property_type_references",
            Self::EntityTypePropertyTypeReferences => "entity_type_property_type_references",
            Self::EntityTypeEntityTypeReferences => "entity_type_entity_type_references",
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
    UpdatedById,
    LatestVersion,
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
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
            Self::UpdatedById => "record_created_by_id",
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
pub enum Entities<'p> {
    EntityUuid,
    EditionId,
    DecisionTime,
    TransactionTime,
    Archived,
    OwnedById,
    UpdatedById,
    EntityTypeOntologyId,
    Properties(Option<JsonField<'p>>),
    LeftToRightOrder,
    RightToLeftOrder,
    LeftEntityUuid,
    RightEntityUuid,
    LeftEntityOwnedById,
    RightEntityOwnedById,
}

impl Entities<'_> {
    pub const fn nullable(self) -> bool {
        match self {
            Self::EntityUuid
            | Self::EditionId
            | Self::DecisionTime
            | Self::TransactionTime
            | Self::Archived
            | Self::OwnedById
            | Self::UpdatedById
            | Self::EntityTypeOntologyId => false,
            Self::Properties(_)
            | Self::LeftEntityUuid
            | Self::RightEntityUuid
            | Self::LeftEntityOwnedById
            | Self::RightEntityOwnedById
            | Self::LeftToRightOrder
            | Self::RightToLeftOrder => true,
        }
    }

    pub const fn from_time_axis(time_axis: TimeAxis) -> Self {
        match time_axis {
            TimeAxis::DecisionTime => Self::DecisionTime,
            TimeAxis::TransactionTime => Self::TransactionTime,
        }
    }
}

impl Entities<'_> {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EntityUuid => "entity_uuid",
            Self::EditionId => "entity_edition_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
            Self::Archived => "archived",
            Self::OwnedById => "owned_by_id",
            Self::UpdatedById => "record_created_by_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
            Self::Properties(None) => "properties",
            Self::Properties(Some(path)) => {
                return transpile_json_field(path, "properties", table, fmt);
            }
            Self::LeftToRightOrder => "left_to_right_order",
            Self::RightToLeftOrder => "right_to_left_order",
            Self::LeftEntityUuid => "left_entity_uuid",
            Self::RightEntityUuid => "right_entity_uuid",
            Self::LeftEntityOwnedById => "left_owned_by_id",
            Self::RightEntityOwnedById => "right_owned_by_id",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeDataTypeReferences {
    SourcePropertyTypeOntologyId,
    TargetDataTypeOntologyId,
}

impl PropertyTypeDataTypeReferences {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetDataTypeOntologyId => "target_data_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypePropertyTypeReferences {
    SourcePropertyTypeOntologyId,
    TargetPropertyTypeOntologyId,
}

impl PropertyTypePropertyTypeReferences {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeOntologyId => "source_property_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypePropertyTypeReferences {
    SourceEntityTypeOntologyId,
    TargetPropertyTypeOntologyId,
}

impl EntityTypePropertyTypeReferences {
    fn transpile_column(self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetPropertyTypeOntologyId => "target_property_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeEntityTypeReferences {
    SourceEntityTypeOntologyId,
    TargetEntityTypeOntologyId,
}

impl EntityTypeEntityTypeReferences {
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
    Entities(Entities<'p>),
    PropertyTypeDataTypeReferences(PropertyTypeDataTypeReferences),
    PropertyTypePropertyTypeReferences(PropertyTypePropertyTypeReferences),
    EntityTypePropertyTypeReferences(EntityTypePropertyTypeReferences),
    EntityTypeEntityTypeReferences(EntityTypeEntityTypeReferences),
}

impl<'p> Column<'p> {
    pub const fn table(self) -> Table {
        match self {
            Self::OntologyIds(_) => Table::OntologyIds,
            Self::DataTypes(_) => Table::DataTypes,
            Self::PropertyTypes(_) => Table::PropertyTypes,
            Self::EntityTypes(_) => Table::EntityTypes,
            Self::Entities(_) => Table::Entities,
            Self::PropertyTypeDataTypeReferences(_) => Table::PropertyTypeDataTypeReferences,
            Self::PropertyTypePropertyTypeReferences(_) => {
                Table::PropertyTypePropertyTypeReferences
            }
            Self::EntityTypePropertyTypeReferences(_) => Table::EntityTypePropertyTypeReferences,
            Self::EntityTypeEntityTypeReferences(_) => Table::EntityTypeEntityTypeReferences,
        }
    }

    pub const fn nullable(self) -> bool {
        match self {
            Self::DataTypes(column) => column.nullable(),
            Self::PropertyTypes(column) => column.nullable(),
            Self::EntityTypes(column) => column.nullable(),
            Self::Entities(column) => column.nullable(),
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
            Self::Entities(column) => column.transpile_column(table, fmt),
            Self::PropertyTypeDataTypeReferences(column) => column.transpile_column(table, fmt),
            Self::PropertyTypePropertyTypeReferences(column) => column.transpile_column(table, fmt),
            Self::EntityTypePropertyTypeReferences(column) => column.transpile_column(table, fmt),
            Self::EntityTypeEntityTypeReferences(column) => column.transpile_column(table, fmt),
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
    PropertyTypeDataTypeReferences,
    PropertyTypePropertyTypeReferences,
    EntityTypePropertyTypeReferences,
    EntityTypeLinks,
    EntityTypeInheritance,
    EntityType,
    LeftEndpoint,
    RightEndpoint,
    OutgoingLink,
    IncomingLink,
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

impl Relation {
    #[expect(clippy::too_many_lines)]
    pub const fn joins(self) -> &'static [ForeignKeyReference] {
        match self {
            Self::DataTypeIds => &[ForeignKeyReference::Single {
                on: Column::DataTypes(DataTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }],
            Self::PropertyTypeIds => &[ForeignKeyReference::Single {
                on: Column::PropertyTypes(PropertyTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }],
            Self::EntityTypeIds => &[ForeignKeyReference::Single {
                on: Column::EntityTypes(EntityTypes::OntologyId),
                join: Column::OntologyIds(OntologyIds::OntologyId),
            }],
            Self::PropertyTypeDataTypeReferences => &[
                ForeignKeyReference::Single {
                    on: Column::PropertyTypes(PropertyTypes::OntologyId),
                    join: Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::SourcePropertyTypeOntologyId,
                    ),
                },
                ForeignKeyReference::Single {
                    on: Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::TargetDataTypeOntologyId,
                    ),
                    join: Column::DataTypes(DataTypes::OntologyId),
                },
            ],
            Self::PropertyTypePropertyTypeReferences => &[
                ForeignKeyReference::Single {
                    on: Column::PropertyTypes(PropertyTypes::OntologyId),
                    join: Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::SourcePropertyTypeOntologyId,
                    ),
                },
                ForeignKeyReference::Single {
                    on: Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::TargetPropertyTypeOntologyId,
                    ),
                    join: Column::PropertyTypes(PropertyTypes::OntologyId),
                },
            ],
            Self::EntityTypePropertyTypeReferences => &[
                ForeignKeyReference::Single {
                    on: Column::EntityTypes(EntityTypes::OntologyId),
                    join: Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::SourceEntityTypeOntologyId,
                    ),
                },
                ForeignKeyReference::Single {
                    on: Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::TargetPropertyTypeOntologyId,
                    ),
                    join: Column::PropertyTypes(PropertyTypes::OntologyId),
                },
            ],
            Self::EntityTypeLinks | Self::EntityTypeInheritance => &[
                ForeignKeyReference::Single {
                    on: Column::EntityTypes(EntityTypes::OntologyId),
                    join: Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::SourceEntityTypeOntologyId,
                    ),
                },
                ForeignKeyReference::Single {
                    on: Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::TargetEntityTypeOntologyId,
                    ),
                    join: Column::EntityTypes(EntityTypes::OntologyId),
                },
            ],
            Self::EntityType => &[ForeignKeyReference::Single {
                on: Column::Entities(Entities::EntityTypeOntologyId),
                join: Column::EntityTypes(EntityTypes::OntologyId),
            }],
            Self::LeftEndpoint => &[ForeignKeyReference::Double {
                on: [
                    Column::Entities(Entities::LeftEntityOwnedById),
                    Column::Entities(Entities::LeftEntityUuid),
                ],
                join: [
                    Column::Entities(Entities::OwnedById),
                    Column::Entities(Entities::EntityUuid),
                ],
            }],
            Self::RightEndpoint => &[ForeignKeyReference::Double {
                on: [
                    Column::Entities(Entities::RightEntityOwnedById),
                    Column::Entities(Entities::RightEntityUuid),
                ],
                join: [
                    Column::Entities(Entities::OwnedById),
                    Column::Entities(Entities::EntityUuid),
                ],
            }],
            Self::OutgoingLink => &[ForeignKeyReference::Double {
                on: [
                    Column::Entities(Entities::OwnedById),
                    Column::Entities(Entities::EntityUuid),
                ],
                join: [
                    Column::Entities(Entities::LeftEntityOwnedById),
                    Column::Entities(Entities::LeftEntityUuid),
                ],
            }],
            Self::IncomingLink => &[ForeignKeyReference::Double {
                on: [
                    Column::Entities(Entities::OwnedById),
                    Column::Entities(Entities::EntityUuid),
                ],
                join: [
                    Column::Entities(Entities::RightEntityOwnedById),
                    Column::Entities(Entities::RightEntityUuid),
                ],
            }],
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
