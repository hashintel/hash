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
    TypeIds,
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
            Self::TypeIds => "type_ids",
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
    JsonParameter(usize),
    StaticText(&'static str),
    StaticJson(&'static str),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum TypeIds {
    VersionId,
    BaseUri,
    Version,
    LatestVersion,
}

impl TypeIds {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::VersionId => "version_id",
            Self::BaseUri => "base_uri",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
        };
        table.transpile(fmt)?;
        write!(fmt, r#"."{column}""#)
    }
}

macro_rules! impl_ontology_column {
    ($($name:ident),* $(,)?) => {
        $(
            #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
            pub enum $name {
                VersionId,
                OwnedById,
                UpdatedById,
                Schema(Option<JsonField<'static>>),
            }

            impl $name {
                pub const fn nullable(self) -> bool {
                    match self {
                        Self::VersionId
                        | Self::OwnedById
                        | Self::UpdatedById => false,
                        Self::Schema(_) => true,
                    }
                }
            }

            impl $name {
                fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
                    let column = match self {
                        Self::VersionId => "version_id",
                        Self::OwnedById => "owned_by_id",
                        Self::UpdatedById => "updated_by_id",
                        Self::Schema(None) => "schema",
                        Self::Schema(Some(path)) => {
                            table.transpile(fmt)?;
                            return match path {
                                JsonField::Json(field) => panic!(
                                    "attempting to access JSON field `{field}` on schema column \
                                     without preparing the value"
                                ),
                                JsonField::JsonPath(path) => panic!(
                                    "attempting to access JSON path `{path}` on schema column \
                                     without preparing the value"
                                ),
                                JsonField::JsonParameter(index) => {
                                    write!(fmt, r#"."schema"->${index}"#)
                                }
                                JsonField::StaticText(field) => {
                                    write!(fmt, r#"."schema"->>'{field}'"#)
                                }
                                JsonField::StaticJson(field) => {
                                    write!(fmt, r#"."schema"->'{field}'"#)
                                }
                            };
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
    RecordId,
    DecisionTime,
    TransactionTime,
    // TODO: Remove when correctly resolving time intervals in subgraphs.
    //   see https://app.asana.com/0/0/1203701389454316/f
    ProjectedTime,
    Archived,
    OwnedById,
    UpdatedById,
    EntityTypeVersionId,
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
            | Self::RecordId
            | Self::DecisionTime
            | Self::TransactionTime
            | Self::ProjectedTime
            | Self::Archived
            | Self::OwnedById
            | Self::UpdatedById
            | Self::EntityTypeVersionId => false,
            Self::Properties(_)
            | Self::LeftEntityUuid
            | Self::RightEntityUuid
            | Self::LeftEntityOwnedById
            | Self::RightEntityOwnedById
            | Self::LeftToRightOrder
            | Self::RightToLeftOrder => true,
        }
    }

    pub fn from_time_axis(time_axis: TimeAxis) -> Self {
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
            Self::RecordId => "entity_record_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
            Self::ProjectedTime => unreachable!("projected time is not a column"),
            Self::Archived => "archived",
            Self::OwnedById => "owned_by_id",
            Self::UpdatedById => "updated_by_id",
            Self::EntityTypeVersionId => "entity_type_version_id",
            Self::Properties(None) => "properties",
            Self::Properties(Some(path)) => {
                write!(fmt, "jsonb_path_query_first(")?;
                table.transpile(fmt)?;
                write!(fmt, r#"."properties", "#)?;
                return match path {
                    JsonField::Json(field) => panic!(
                        "attempting to access JSON field `{field}` on properties column without \
                         preparing the value"
                    ),
                    JsonField::JsonPath(path) => panic!(
                        "attempting to access JSON path `{path}` on properties column without \
                         preparing the value"
                    ),
                    JsonField::StaticText(field) => {
                        panic!("attempting to access JSON field `{field}` on properties as text")
                    }
                    JsonField::JsonParameter(index) => {
                        write!(fmt, "${index}::text::jsonpath)")
                    }
                    JsonField::StaticJson(field) => {
                        write!(fmt, r#"'{field}::text::jsonpath')"#)
                    }
                };
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
    SourcePropertyTypeVersionId,
    TargetDataTypeVersionId,
}

impl PropertyTypeDataTypeReferences {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeVersionId => "source_property_type_version_id",
            Self::TargetDataTypeVersionId => "target_data_type_version_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypePropertyTypeReferences {
    SourcePropertyTypeVersionId,
    TargetPropertyTypeVersionId,
}

impl PropertyTypePropertyTypeReferences {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourcePropertyTypeVersionId => "source_property_type_version_id",
            Self::TargetPropertyTypeVersionId => "target_property_type_version_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypePropertyTypeReferences {
    SourceEntityTypeVersionId,
    TargetPropertyTypeVersionId,
}

impl EntityTypePropertyTypeReferences {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeVersionId => "source_entity_type_version_id",
            Self::TargetPropertyTypeVersionId => "target_property_type_version_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum EntityTypeEntityTypeReferences {
    SourceEntityTypeVersionId,
    TargetEntityTypeVersionId,
}

impl EntityTypeEntityTypeReferences {
    fn transpile_column(&self, table: &impl Transpile, fmt: &mut fmt::Formatter) -> fmt::Result {
        table.transpile(fmt)?;
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeVersionId => "source_entity_type_version_id",
            Self::TargetEntityTypeVersionId => "target_entity_type_version_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Column<'p> {
    TypeIds(TypeIds),
    DataTypes(DataTypes),
    PropertyTypes(PropertyTypes),
    EntityTypes(EntityTypes),
    Entities(Entities<'p>),
    PropertyTypeDataTypeReferences(PropertyTypeDataTypeReferences),
    PropertyTypePropertyTypeReferences(PropertyTypePropertyTypeReferences),
    EntityTypePropertyTypeReferences(EntityTypePropertyTypeReferences),
    EntityTypeEntityTypeReferences(EntityTypeEntityTypeReferences),
}

impl<'p> Column<'p> {
    pub const fn table(self) -> Table {
        match self {
            Self::TypeIds(_) => Table::TypeIds,
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
            Self::TypeIds(column) => column.transpile_column(table, fmt),
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

impl Relation {
    pub const fn joins(self) -> &'static [(Column<'static>, Column<'static>)] {
        match self {
            Self::DataTypeIds => &[(
                Column::DataTypes(DataTypes::VersionId),
                Column::TypeIds(TypeIds::VersionId),
            )],
            Self::PropertyTypeIds => &[(
                Column::PropertyTypes(PropertyTypes::VersionId),
                Column::TypeIds(TypeIds::VersionId),
            )],
            Self::EntityTypeIds => &[(
                Column::EntityTypes(EntityTypes::VersionId),
                Column::TypeIds(TypeIds::VersionId),
            )],
            Self::PropertyTypeDataTypeReferences => &[
                (
                    Column::PropertyTypes(PropertyTypes::VersionId),
                    Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::SourcePropertyTypeVersionId,
                    ),
                ),
                (
                    Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::TargetDataTypeVersionId,
                    ),
                    Column::DataTypes(DataTypes::VersionId),
                ),
            ],
            Self::PropertyTypePropertyTypeReferences => &[
                (
                    Column::PropertyTypes(PropertyTypes::VersionId),
                    Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::SourcePropertyTypeVersionId,
                    ),
                ),
                (
                    Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::TargetPropertyTypeVersionId,
                    ),
                    Column::PropertyTypes(PropertyTypes::VersionId),
                ),
            ],
            Self::EntityTypePropertyTypeReferences => &[
                (
                    Column::EntityTypes(EntityTypes::VersionId),
                    Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::SourceEntityTypeVersionId,
                    ),
                ),
                (
                    Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::TargetPropertyTypeVersionId,
                    ),
                    Column::PropertyTypes(PropertyTypes::VersionId),
                ),
            ],
            Self::EntityTypeLinks | Self::EntityTypeInheritance => &[
                (
                    Column::EntityTypes(EntityTypes::VersionId),
                    Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::SourceEntityTypeVersionId,
                    ),
                ),
                (
                    Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::TargetEntityTypeVersionId,
                    ),
                    Column::EntityTypes(EntityTypes::VersionId),
                ),
            ],
            Self::EntityType => &[(
                Column::Entities(Entities::EntityTypeVersionId),
                Column::EntityTypes(EntityTypes::VersionId),
            )],
            Self::LeftEndpoint => &[(
                Column::Entities(Entities::LeftEntityUuid),
                Column::Entities(Entities::EntityUuid),
            )],
            Self::RightEndpoint => &[(
                Column::Entities(Entities::RightEntityUuid),
                Column::Entities(Entities::EntityUuid),
            )],
            Self::OutgoingLink => &[(
                Column::Entities(Entities::EntityUuid),
                Column::Entities(Entities::LeftEntityUuid),
            )],
            Self::IncomingLink => &[(
                Column::Entities(Entities::EntityUuid),
                Column::Entities(Entities::RightEntityUuid),
            )],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{ontology::DataTypeQueryPath, store::postgres::query::PostgresQueryPath};

    #[test]
    fn transpile_table() {
        assert_eq!(Table::TypeIds.transpile_to_string(), r#""type_ids""#);
        assert_eq!(Table::DataTypes.transpile_to_string(), r#""data_types""#);
    }

    #[test]
    fn transpile_aliased_table() {
        assert_eq!(
            Table::TypeIds
                .aliased(Alias {
                    condition_index: 1,
                    chain_depth: 2,
                    number: 3,
                })
                .transpile_to_string(),
            r#""type_ids_1_2_3""#
        );
    }

    #[test]
    fn transpile_column() {
        assert_eq!(
            DataTypeQueryPath::VersionId
                .terminating_column()
                .transpile_to_string(),
            r#""data_types"."version_id""#
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
            DataTypeQueryPath::VersionId
                .terminating_column()
                .aliased(alias)
                .transpile_to_string(),
            r#""data_types_1_2_3"."version_id""#
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
