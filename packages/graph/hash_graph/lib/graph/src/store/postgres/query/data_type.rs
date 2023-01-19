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
            Self::BaseUri | Self::Version | Self::OwnedById | Self::UpdatedById => {
                vec![Relation::DataTypeIds]
            }
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column<'static> {
        match self {
            Self::BaseUri => Column::TypeIds(TypeIds::BaseUri),
            Self::Version => Column::TypeIds(TypeIds::Version),
            Self::OwnedById => Column::TypeIds(TypeIds::OwnedById),
            Self::UpdatedById => Column::TypeIds(TypeIds::UpdatedById),
            Self::VersionId => Column::DataTypes(DataTypes::VersionId),
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
