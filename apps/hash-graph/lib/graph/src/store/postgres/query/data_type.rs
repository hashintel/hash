use super::table::OwnedOntologyMetadata;
use crate::{
    ontology::{DataTypeQueryPath, DataTypeWithMetadata},
    store::postgres::query::{
        table::{Column, DataTypes, JsonField, OntologyIds, Relation},
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
            Self::OwnedById | Self::UpdatedById => {
                vec![Relation::DataTypeOwnedMetadata]
            }
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUri => Column::OntologyIds(OntologyIds::BaseUri),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::OwnedById => Column::OwnedOntologyMetadata(OwnedOntologyMetadata::OwnedById),
            Self::UpdatedById => Column::OwnedOntologyMetadata(OwnedOntologyMetadata::UpdatedById),
            Self::OntologyId => Column::DataTypes(DataTypes::OntologyId),
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
