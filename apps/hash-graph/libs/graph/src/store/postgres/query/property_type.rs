use std::iter::once;

use graph_types::ontology::PropertyTypeWithMetadata;

use crate::{
    ontology::PropertyTypeQueryPath,
    store::postgres::query::{
        table::{
            Column, JsonField, OntologyAdditionalMetadata, OntologyIds, OntologyOwnedMetadata,
            OntologyTemporalMetadata, PropertyTypes, ReferenceTable, Relation,
        },
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

impl PostgresRecord for PropertyTypeWithMetadata {
    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }
}

impl PostgresQueryPath for PropertyTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::OntologyId
            | Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Schema(_) => vec![Relation::PropertyTypeIds],
            Self::BaseUrl | Self::Version => vec![Relation::OntologyIds],
            Self::OwnedById => vec![Relation::OntologyOwnedMetadata],
            Self::AdditionalMetadata => vec![Relation::OntologyAdditionalMetadata],
            Self::TransactionTime | Self::EditionCreatedById | Self::EditionArchivedById => vec![],
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                direction: EdgeDirection::Outgoing,
            })
            .chain(path.relations())
            .collect(),
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                direction,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsPropertiesOn,
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsPropertiesOn {
                    inheritance_depth: *inheritance_depth,
                },
                direction: EdgeDirection::Incoming,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind:
                    OntologyEdgeKind::ConstrainsValuesOn
                    | OntologyEdgeKind::InheritsFrom
                    | OntologyEdgeKind::ConstrainsLinksOn
                    | OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path: _,
                inheritance_depth: _,
            }
            | Self::PropertyTypeEdge {
                edge_kind:
                    OntologyEdgeKind::ConstrainsValuesOn
                    | OntologyEdgeKind::InheritsFrom
                    | OntologyEdgeKind::ConstrainsLinksOn
                    | OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path: _,
                direction: _,
            }
            | Self::DataTypeEdge {
                edge_kind:
                    OntologyEdgeKind::ConstrainsPropertiesOn
                    | OntologyEdgeKind::InheritsFrom
                    | OntologyEdgeKind::ConstrainsLinksOn
                    | OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path: _,
            } => unreachable!("Invalid path: {self}"),
        }
    }

    fn terminating_column(&self) -> Column {
        match self {
            Self::BaseUrl => Column::OntologyIds(OntologyIds::BaseUrl),
            Self::Version => Column::OntologyIds(OntologyIds::Version),
            Self::TransactionTime => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::TransactionTime)
            }
            Self::OwnedById => Column::OntologyOwnedMetadata(OntologyOwnedMetadata::WebId),
            Self::EditionCreatedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::CreatedById)
            }
            Self::EditionArchivedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::ArchivedById)
            }
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
            Self::AdditionalMetadata => {
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata)
            }
        }
    }
}
