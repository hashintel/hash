use std::iter::once;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeWithMetadata},
    store::postgres::query::{
        table::{Column, EntityTypes, JsonField, OntologyIds, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
};

impl PostgresRecord for EntityTypeWithMetadata {
    fn base_table() -> Table {
        Table::EntityTypes
    }
}

impl PostgresQueryPath for EntityTypeQueryPath<'_> {
    /// Returns the relations that are required to access the path.
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUrl
            | Self::Version
            | Self::UpdatedById
            | Self::OwnedById
            | Self::AdditionalMetadata(_) => {
                vec![Relation::EntityTypeIds]
            }
            Self::Properties(path) => once(Relation::EntityTypePropertyTypeReferences)
                .chain(path.relations())
                .collect(),
            Self::Links(path) => once(Relation::EntityTypeLinks)
                .chain(path.relations())
                .collect(),
            Self::InheritsFrom(path) => once(Relation::EntityTypeInheritance)
                .chain(path.relations())
                .collect(),
            _ => vec![],
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUrl => Column::OntologyIds(OntologyIds::BaseUrl),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::OwnedById => Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(
                JsonField::StaticText("owned_by_id"),
            ))),
            Self::UpdatedById => Column::OntologyIds(OntologyIds::UpdatedById),
            Self::OntologyId => Column::EntityTypes(EntityTypes::OntologyId),
            Self::Schema(path) => path
                .as_ref()
                .map_or(Column::EntityTypes(EntityTypes::Schema(None)), |path| {
                    Column::EntityTypes(EntityTypes::Schema(Some(JsonField::JsonPath(path))))
                }),
            Self::VersionedUrl => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Description => Column::EntityTypes(EntityTypes::Schema(Some(
                JsonField::StaticText("description"),
            ))),
            Self::Examples => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("examples"))))
            }
            Self::Required => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("required"))))
            }
            Self::Links(path) | Self::InheritsFrom(path) => path.terminating_column(),
            Self::Properties(path) => path.terminating_column(),
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
