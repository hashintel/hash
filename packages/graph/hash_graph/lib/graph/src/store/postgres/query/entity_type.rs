use std::{borrow::Cow, iter::once};

use type_system::EntityType;

use crate::{
    ontology::EntityTypeQueryPath,
    store::postgres::query::{
        table::{Column, EntityTypes, JsonField, Relation, TypeIds},
        Path, PostgresQueryRecord, Table,
    },
};

impl PostgresQueryRecord for EntityType {
    fn base_table() -> Table {
        Table::EntityTypes
    }

    fn default_selection_paths() -> &'static [Self::Path<'static>] {
        &[
            EntityTypeQueryPath::VersionedUri,
            EntityTypeQueryPath::Schema,
            EntityTypeQueryPath::OwnedById,
            EntityTypeQueryPath::CreatedById,
            EntityTypeQueryPath::UpdatedById,
        ]
    }
}

impl Path<'_> for EntityTypeQueryPath {
    /// Returns the relations that are required to access the path.
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::BaseUri | Self::Version => vec![Relation::EntityTypeIds],
            Self::Properties(path) => once(Relation::EntityTypePropertyTypeReferences)
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
            Self::CreatedById => Column::EntityTypes(EntityTypes::CreatedById),
            Self::UpdatedById => Column::EntityTypes(EntityTypes::UpdatedById),
            Self::Schema => Column::EntityTypes(EntityTypes::Schema(None)),
            Self::VersionedUri => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("$id"),
            )))),
            Self::Title => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("title"),
            )))),
            Self::Description => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("description"),
            )))),
            Self::Default => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("default"),
            )))),
            Self::Examples => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("examples"),
            )))),
            Self::Required => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("required"),
            )))),
            Self::RequiredLinks => Column::EntityTypes(EntityTypes::Schema(Some(JsonField::Text(
                &Cow::Borrowed("requiredLinks"),
            )))),
            Self::InheritsFrom(path) => path.terminating_column(),
            Self::Properties(path) => path.terminating_column(),
        }
    }
}
