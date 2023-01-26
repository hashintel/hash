use std::iter::once;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeWithMetadata},
    store::postgres::query::{
        table::{Column, EntityTypes, JsonField, Relation, TypeIds},
        PostgresQueryPath, PostgresRecord, Table,
    },
};

impl PostgresRecord for EntityTypeWithMetadata {
    fn base_table() -> Table {
        Table::EntityTypes
    }
}

impl PostgresQueryPath for EntityTypeQueryPath {
    /// Returns the relations that are required to access the path.
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => vec![Relation::EntityTypeIds],
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
            Self::BaseUri => Column::TypeIds(TypeIds::BaseUri),
            Self::Version => Column::TypeIds(TypeIds::Version),
            Self::VersionId => Column::EntityTypes(EntityTypes::VersionId),
            Self::OwnedById => Column::EntityTypes(EntityTypes::OwnedById),
            Self::UpdatedById => Column::EntityTypes(EntityTypes::UpdatedById),
            Self::Schema => Column::EntityTypes(EntityTypes::Schema(None)),
            Self::VersionedUri => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Description => Column::EntityTypes(EntityTypes::Schema(Some(
                JsonField::StaticText("description"),
            ))),
            Self::Default => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("default"))))
            }
            Self::Examples => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("examples"))))
            }
            Self::Required => {
                Column::EntityTypes(EntityTypes::Schema(Some(JsonField::StaticText("required"))))
            }
            Self::RequiredLinks => Column::EntityTypes(EntityTypes::Schema(Some(
                JsonField::StaticText("requiredLinks"),
            ))),
            Self::Links(path) | Self::InheritsFrom(path) => path.terminating_column(),
            Self::Properties(path) => path.terminating_column(),
        }
    }
}
