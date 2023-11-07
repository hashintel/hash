use std::iter::once;

use graph_types::ontology::EntityTypeWithMetadata;

use crate::{
    ontology::EntityTypeQueryPath,
    store::postgres::query::{
        table::{
            Column, EntityTypes, JsonField, OntologyAdditionalMetadata, OntologyIds,
            OntologyOwnedMetadata, OntologyTemporalMetadata, ReferenceTable, Relation,
        },
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
};

impl PostgresRecord for EntityTypeWithMetadata {
    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }
}

impl PostgresQueryPath for EntityTypeQueryPath<'_> {
    /// Returns the relations that are required to access the path.
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::OntologyId
            | Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Examples
            | Self::Required
            | Self::LabelProperty
            | Self::Icon
            | Self::Schema(_)
            | Self::ClosedSchema(_) => vec![Relation::EntityTypeIds],
            Self::BaseUrl | Self::Version => vec![Relation::OntologyIds],
            Self::OwnedById => vec![Relation::OntologyOwnedMetadata],
            Self::AdditionalMetadata => vec![Relation::OntologyAdditionalMetadata],
            Self::TransactionTime | Self::RecordCreatedById | Self::RecordArchivedById => vec![],
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsPropertiesOn {
                    inheritance_depth: *inheritance_depth,
                },
                direction: EdgeDirection::Outgoing,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::InheritsFrom,
                path,
                direction,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeInheritsFrom {
                    inheritance_depth: *inheritance_depth,
                },
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinksOn,
                path,
                direction,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsLinksOn {
                    inheritance_depth: *inheritance_depth,
                },
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsLinkDestinationsOn,
                path,
                direction,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsLinkDestinationsOn {
                    inheritance_depth: *inheritance_depth,
                },
                direction: *direction,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityEdge {
                edge_kind: SharedEdgeKind::IsOfType,
                path,
                inheritance_depth,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityIsOfType {
                    inheritance_depth: *inheritance_depth,
                },
                direction: EdgeDirection::Incoming,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind:
                    OntologyEdgeKind::ConstrainsValuesOn | OntologyEdgeKind::ConstrainsPropertiesOn,
                path: _,
                direction: _,
                inheritance_depth: _,
            }
            | Self::PropertyTypeEdge {
                edge_kind:
                    OntologyEdgeKind::InheritsFrom
                    | OntologyEdgeKind::ConstrainsLinksOn
                    | OntologyEdgeKind::ConstrainsLinkDestinationsOn
                    | OntologyEdgeKind::ConstrainsValuesOn,
                path: _,
                inheritance_depth: _,
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
            Self::RecordCreatedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::RecordCreatedById)
            }
            Self::RecordArchivedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::RecordArchivedById)
            }
            Self::OntologyId => Column::EntityTypes(EntityTypes::OntologyId),
            Self::Schema(path) => path
                .as_ref()
                .map_or(Column::EntityTypes(EntityTypes::Schema(None)), |path| {
                    Column::EntityTypes(EntityTypes::Schema(Some(JsonField::JsonPath(path))))
                }),
            Self::ClosedSchema(path) => path.as_ref().map_or(
                Column::EntityTypes(EntityTypes::ClosedSchema(None)),
                |path| {
                    Column::EntityTypes(EntityTypes::ClosedSchema(Some(JsonField::JsonPath(path))))
                },
            ),
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
            Self::LabelProperty => Column::EntityTypes(EntityTypes::LabelProperty),
            Self::Icon => Column::EntityTypes(EntityTypes::Icon),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => {
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata)
            }
        }
    }
}
