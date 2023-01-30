use std::{
    borrow::Cow,
    fmt::{self, Debug},
    hash::Hash,
};

use crate::{identifier::time::TimeAxis, store::postgres::query::Transpile};

/// The name of a [`Table`] in the Postgres database.
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Table {
    OntologyIds,
    OwnedOntologyMetadata,
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
            Self::OntologyIds => "ontology_ids",
            Self::OwnedOntologyMetadata => "owned_ontology_metadata",
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

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum JsonField<'p> {
    Json(&'p Cow<'p, str>),
    JsonParameter(usize),
    StaticText(&'static str),
    StaticJson(&'static str),
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OntologyIds {
    OntologyId,
    BaseUri,
    Version,
    LatestVersion,
}

impl Transpile for OntologyIds {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::BaseUri => "base_uri",
            Self::Version => "version",
            Self::LatestVersion => "latest_version",
        };
        write!(fmt, r#"."{column}""#)
    }
}

#[expect(clippy::enum_variant_names)]
#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum OwnedOntologyMetadata {
    OntologyId,
    OwnedById,
    UpdatedById,
}

impl Transpile for OwnedOntologyMetadata {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::OntologyId => "ontology_id",
            Self::OwnedById => "owned_by_id",
            Self::UpdatedById => "updated_by_id",
        };
        write!(fmt, r#"."{column}""#)
    }
}

macro_rules! impl_ontology_column {
    ($($name:ident),* $(,)?) => {
        $(
            #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
            pub enum $name {
                OntologyId,
                Schema(Option<JsonField<'static>>),
            }

            impl $name {
                pub const fn nullable(self) -> bool {
                    match self {
                        Self::OntologyId => false,
                        Self::Schema(_) => true,
                    }
                }
            }

            impl Transpile for $name {
                fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
                    let column = match self {
                        Self::OntologyId => "ontology_id",
                        Self::Schema(None) => "schema",
                        Self::Schema(Some(path)) => {
                            return match path {
                                JsonField::Json(field) => panic!(
                                    "attempting to access JSON field `{field}` on schema column \
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
            | Self::RecordId
            | Self::DecisionTime
            | Self::TransactionTime
            | Self::ProjectedTime
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

    pub fn from_time_axis(time_axis: TimeAxis) -> Self {
        match time_axis {
            TimeAxis::DecisionTime => Self::DecisionTime,
            TimeAxis::TransactionTime => Self::TransactionTime,
        }
    }
}

impl Transpile for Entities<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        let column = match self {
            Self::EntityUuid => "entity_uuid",
            Self::RecordId => "entity_record_id",
            Self::DecisionTime => "decision_time",
            Self::TransactionTime => "transaction_time",
            Self::ProjectedTime => unreachable!("projected time is not a column"),
            Self::Archived => "archived",
            Self::OwnedById => "owned_by_id",
            Self::UpdatedById => "updated_by_id",
            Self::EntityTypeOntologyId => "entity_type_ontology_id",
            Self::Properties(None) => "properties",
            Self::Properties(Some(path)) => {
                return match path {
                    JsonField::Json(field) => panic!(
                        "attempting to access JSON field `{field}` on properties column without \
                         preparing the value"
                    ),
                    JsonField::JsonParameter(index) => {
                        write!(fmt, r#"."properties"->${index}"#)
                    }
                    JsonField::StaticText(field) => {
                        write!(fmt, r#"."properties"->>'{field}'"#)
                    }
                    JsonField::StaticJson(field) => {
                        write!(fmt, r#"."properties"->'{field}'"#)
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
        write!(fmt, r#"."{column}""#)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum PropertyTypeDataTypeReferences {
    SourcePropertyTypeOntologyId,
    TargetDataTypeOntologyId,
}

impl Transpile for PropertyTypeDataTypeReferences {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
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

impl Transpile for PropertyTypePropertyTypeReferences {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
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

impl Transpile for EntityTypePropertyTypeReferences {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
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

impl Transpile for EntityTypeEntityTypeReferences {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        write!(fmt, r#"."{}""#, match self {
            Self::SourceEntityTypeOntologyId => "source_entity_type_ontology_id",
            Self::TargetEntityTypeOntologyId => "target_entity_type_ontology_id",
        })
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Column<'p> {
    OntologyIds(OntologyIds),
    OwnedOntologyMetadata(OwnedOntologyMetadata),
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
            Self::OntologyIds(_) => Table::OntologyIds,
            Self::OwnedOntologyMetadata(_) => Table::OwnedOntologyMetadata,
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
}

impl Transpile for Column<'_> {
    fn transpile(&self, fmt: &mut fmt::Formatter) -> fmt::Result {
        self.table().transpile(fmt)?;
        match self {
            Self::OntologyIds(column) => column.transpile(fmt),
            Self::OwnedOntologyMetadata(column) => column.transpile(fmt),
            Self::DataTypes(column) => column.transpile(fmt),
            Self::PropertyTypes(column) => column.transpile(fmt),
            Self::EntityTypes(column) => column.transpile(fmt),
            Self::Entities(column) => column.transpile(fmt),
            Self::PropertyTypeDataTypeReferences(column) => column.transpile(fmt),
            Self::PropertyTypePropertyTypeReferences(column) => column.transpile(fmt),
            Self::EntityTypePropertyTypeReferences(column) => column.transpile(fmt),
            Self::EntityTypeEntityTypeReferences(column) => column.transpile(fmt),
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
        self.table().transpile(fmt)?;
        match self.column {
            Column::OntologyIds(column) => column.transpile(fmt),
            Column::OwnedOntologyMetadata(column) => column.transpile(fmt),
            Column::DataTypes(column) => column.transpile(fmt),
            Column::PropertyTypes(column) => column.transpile(fmt),
            Column::EntityTypes(column) => column.transpile(fmt),
            Column::Entities(column) => column.transpile(fmt),
            Column::PropertyTypeDataTypeReferences(column) => column.transpile(fmt),
            Column::PropertyTypePropertyTypeReferences(column) => column.transpile(fmt),
            Column::EntityTypePropertyTypeReferences(column) => column.transpile(fmt),
            Column::EntityTypeEntityTypeReferences(column) => column.transpile(fmt),
        }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub enum Relation {
    DataTypeIds,
    PropertyTypeIds,
    EntityTypeIds,
    DataTypeOwnedMetadata,
    PropertyTypeOwnedMetadata,
    EntityTypeOwnedMetadata,
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
                Column::DataTypes(DataTypes::OntologyId),
                Column::OntologyIds(OntologyIds::OntologyId),
            )],
            Self::PropertyTypeIds => &[(
                Column::PropertyTypes(PropertyTypes::OntologyId),
                Column::OntologyIds(OntologyIds::OntologyId),
            )],
            Self::EntityTypeIds => &[(
                Column::EntityTypes(EntityTypes::OntologyId),
                Column::OntologyIds(OntologyIds::OntologyId),
            )],
            Self::DataTypeOwnedMetadata => &[(
                Column::DataTypes(DataTypes::OntologyId),
                Column::OwnedOntologyMetadata(OwnedOntologyMetadata::OntologyId),
            )],
            Self::PropertyTypeOwnedMetadata => &[(
                Column::PropertyTypes(PropertyTypes::OntologyId),
                Column::OwnedOntologyMetadata(OwnedOntologyMetadata::OntologyId),
            )],
            Self::EntityTypeOwnedMetadata => &[(
                Column::EntityTypes(EntityTypes::OntologyId),
                Column::OwnedOntologyMetadata(OwnedOntologyMetadata::OntologyId),
            )],
            Self::PropertyTypeDataTypeReferences => &[
                (
                    Column::PropertyTypes(PropertyTypes::OntologyId),
                    Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::SourcePropertyTypeOntologyId,
                    ),
                ),
                (
                    Column::PropertyTypeDataTypeReferences(
                        PropertyTypeDataTypeReferences::TargetDataTypeOntologyId,
                    ),
                    Column::DataTypes(DataTypes::OntologyId),
                ),
            ],
            Self::PropertyTypePropertyTypeReferences => &[
                (
                    Column::PropertyTypes(PropertyTypes::OntologyId),
                    Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::SourcePropertyTypeOntologyId,
                    ),
                ),
                (
                    Column::PropertyTypePropertyTypeReferences(
                        PropertyTypePropertyTypeReferences::TargetPropertyTypeOntologyId,
                    ),
                    Column::PropertyTypes(PropertyTypes::OntologyId),
                ),
            ],
            Self::EntityTypePropertyTypeReferences => &[
                (
                    Column::EntityTypes(EntityTypes::OntologyId),
                    Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::SourceEntityTypeOntologyId,
                    ),
                ),
                (
                    Column::EntityTypePropertyTypeReferences(
                        EntityTypePropertyTypeReferences::TargetPropertyTypeOntologyId,
                    ),
                    Column::PropertyTypes(PropertyTypes::OntologyId),
                ),
            ],
            Self::EntityTypeLinks | Self::EntityTypeInheritance => &[
                (
                    Column::EntityTypes(EntityTypes::OntologyId),
                    Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::SourceEntityTypeOntologyId,
                    ),
                ),
                (
                    Column::EntityTypeEntityTypeReferences(
                        EntityTypeEntityTypeReferences::TargetEntityTypeOntologyId,
                    ),
                    Column::EntityTypes(EntityTypes::OntologyId),
                ),
            ],
            Self::EntityType => &[(
                Column::Entities(Entities::EntityTypeOntologyId),
                Column::EntityTypes(EntityTypes::OntologyId),
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
