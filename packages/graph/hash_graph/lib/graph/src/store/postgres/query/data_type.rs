use std::borrow::Cow;

use crate::{
    ontology::{DataTypeQueryPath, DataTypeWithMetadata},
    store::postgres::query::{
        table::{Column, DataTypes, JsonField, Relation, TypeIds},
        PostgresQueryPath, PostgresRecord, Table,
    },
};

impl PostgresRecord for DataTypeWithMetadata {
    fn base_table() -> Table {
        Table::DataTypes
    }
}

impl PostgresQueryPath for DataTypeQueryPath {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => {
                vec![Relation::DataTypeIds]
            }
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column<'static> {
        match self {
            Self::BaseUri => Column::TypeIds(TypeIds::BaseUri),
            Self::Version => Column::TypeIds(TypeIds::Version),
            Self::VersionId => Column::DataTypes(DataTypes::VersionId),
            Self::OwnedById => Column::DataTypes(DataTypes::OwnedById),
            Self::UpdatedById => Column::DataTypes(DataTypes::UpdatedById),
            Self::Schema => Column::DataTypes(DataTypes::Schema(None)),
            Self::VersionedUri => Column::DataTypes(DataTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("$id"),
            )))),
            Self::Title => Column::DataTypes(DataTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("title"),
            )))),
            Self::Type => Column::DataTypes(DataTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("type"),
            )))),
            Self::Description => Column::DataTypes(DataTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("description"),
            )))),
        }
    }
}
