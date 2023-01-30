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

impl PostgresQueryPath for DataTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => {
                vec![Relation::DataTypeIds]
            }
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUri => Column::TypeIds(TypeIds::BaseUri),
            Self::Version => Column::TypeIds(TypeIds::Version),
            Self::VersionId => Column::DataTypes(DataTypes::VersionId),
            Self::OwnedById => Column::DataTypes(DataTypes::OwnedById),
            Self::UpdatedById => Column::DataTypes(DataTypes::UpdatedById),
            Self::Schema(path) => path
                .as_ref()
                .map_or(Column::DataTypes(DataTypes::Schema(None)), |path| {
                    Column::DataTypes(DataTypes::Schema(Some(JsonField::JsonPath(path))))
                }),
            Self::VersionedUri => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Type => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("type")))),
            Self::Description => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText(
                "description",
            )))),
        }
    }
}
