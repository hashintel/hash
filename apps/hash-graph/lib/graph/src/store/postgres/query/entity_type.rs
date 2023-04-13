use std::iter::once;

use crate::{
    ontology::{EntityTypeQueryPath, EntityTypeWithMetadata},
    store::postgres::query::{
        table::{Column, EntityTypes, JsonField, OntologyIds, ReferenceTable, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
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
            Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Examples
            | Self::Required
            | Self::OntologyId
            | Self::Schema(_) => vec![],
            Self::BaseUrl
            | Self::Version
            | Self::TransactionTime
            | Self::RecordCreatedById
            | Self::OwnedById
            | Self::AdditionalMetadata(_) => {
                vec![Relation::EntityTypeIds]
            }
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsPropertiesOn,
                direction: EdgeDirection::Outgoing,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeInheritsFrom,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsLinksOn,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsLinkDestinationsOn,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityIsOfType,
                direction: EdgeDirection::Incoming,
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
            Self::TransactionTime => Column::OntologyIds(OntologyIds::TransactionTime),
            Self::OwnedById => Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(
                JsonField::StaticText("owned_by_id"),
            ))),
            Self::RecordCreatedById => Column::OntologyIds(OntologyIds::RecordCreatedById),
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
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityEdge { path, .. } => path.terminating_column(),
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
