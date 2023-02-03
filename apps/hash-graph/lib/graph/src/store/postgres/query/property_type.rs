use std::iter::once;

use crate::{
    ontology::{PropertyTypeQueryPath, PropertyTypeWithMetadata},
    store::postgres::query::{
        table::{Column, JsonField, OntologyIds, PropertyTypes, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
};

impl PostgresRecord for PropertyTypeWithMetadata {
    fn base_table() -> Table {
        Table::PropertyTypes
    }
}

impl PostgresQueryPath for PropertyTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri
            | Self::Version
            | Self::UpdatedById
            | Self::OwnedById
            | Self::AdditionalMetadata(_) => {
                vec![Relation::DataTypeIds]
            }
            Self::DataTypes(path) => once(Relation::PropertyTypeDataTypeReferences)
                .chain(path.relations())
                .collect(),
            Self::PropertyTypes(path) => once(Relation::PropertyTypePropertyTypeReferences)
                .chain(path.relations())
                .collect(),
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUri => Column::OntologyIds(OntologyIds::BaseUri),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::OwnedById => Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(
                JsonField::StaticText("owned_by_id"),
            ))),
            Self::UpdatedById => Column::OntologyIds(OntologyIds::UpdatedById),
            Self::OntologyId => Column::PropertyTypes(PropertyTypes::OntologyId),
            Self::Schema(path) => {
                path.as_ref()
                    .map_or(Column::PropertyTypes(PropertyTypes::Schema(None)), |path| {
                        Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::JsonPath(
                            path,
                        ))))
                    })
            }
            Self::VersionedUri => {
                Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Description => Column::PropertyTypes(PropertyTypes::Schema(Some(
                JsonField::StaticText("description"),
            ))),
            Self::DataTypes(path) => path.terminating_column(),
            Self::PropertyTypes(path) => path.terminating_column(),
            Self::AdditionalMetadata(path) => path.as_ref().map_or(
                Column::OntologyIds(OntologyIds::AdditionalMetadata(None)),
                |path| {
                    Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(JsonField::JsonPath(
                        path,
                    ))))
                },
            ),
        }
    }
}
