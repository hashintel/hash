use std::iter::once;

use crate::{
    ontology::{PropertyTypeQueryPath, PropertyTypeWithMetadata},
    store::postgres::query::{
        table::{Column, JsonField, OntologyIds, PropertyTypes, ReferenceTable, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::OntologyEdgeKind,
};

impl PostgresRecord for PropertyTypeWithMetadata {
    fn base_table() -> Table {
        Table::PropertyTypes
    }
}

impl PostgresQueryPath for PropertyTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::OntologyId
            | Self::Schema(_) => vec![],
            Self::BaseUrl
            | Self::Version
            | Self::RecordCreatedById
            | Self::OwnedById
            | Self::AdditionalMetadata(_) => {
                vec![Relation::PropertyTypeIds]
            }
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                reversed: false,
            })
            .chain(path.relations())
            .collect(),
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                reversed,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsPropertiesOn,
                reversed: *reversed,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsPropertiesOn,
                reversed: true,
            })
            .chain(path.relations())
            .collect(),
            _ => unreachable!("Invalid path: {self}"),
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUrl => Column::OntologyIds(OntologyIds::BaseUrl),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::OwnedById => Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(
                JsonField::StaticText("owned_by_id"),
            ))),
            Self::RecordCreatedById => Column::OntologyIds(OntologyIds::RecordCreatedById),
            Self::OntologyId => Column::PropertyTypes(PropertyTypes::OntologyId),
            Self::Schema(path) => {
                path.as_ref()
                    .map_or(Column::PropertyTypes(PropertyTypes::Schema(None)), |path| {
                        Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::JsonPath(
                            path,
                        ))))
                    })
            }
            Self::VersionedUrl => {
                Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::PropertyTypes(PropertyTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Description => Column::PropertyTypes(PropertyTypes::Schema(Some(
                JsonField::StaticText("description"),
            ))),
            Self::DataTypeEdge { path, .. } => path.terminating_column(),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
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
