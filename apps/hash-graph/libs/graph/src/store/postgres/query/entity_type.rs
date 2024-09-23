use core::iter::once;

use hash_graph_store::{
    entity_type::EntityTypeQueryPath,
    subgraph::edges::{EdgeDirection, OntologyEdgeKind, SharedEdgeKind},
};

use crate::store::postgres::query::{
    table::{
        Column, EntityTypeEmbeddings, EntityTypes, JsonField, OntologyAdditionalMetadata,
        OntologyIds, OntologyOwnedMetadata, OntologyTemporalMetadata, ReferenceTable, Relation,
    },
    PostgresQueryPath,
};

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
            Self::TransactionTime | Self::EditionProvenance(_) => vec![],
            Self::Embedding => vec![Relation::EntityTypeEmbeddings],
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

    fn terminating_column(&self) -> (Column, Option<JsonField<'_>>) {
        match self {
            Self::BaseUrl => (Column::OntologyIds(OntologyIds::BaseUrl), None),
            Self::Version => (Column::OntologyIds(OntologyIds::Version), None),
            Self::TransactionTime => (
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::TransactionTime),
                None,
            ),
            Self::OwnedById => (
                Column::OntologyOwnedMetadata(OntologyOwnedMetadata::WebId),
                None,
            ),
            Self::OntologyId => (Column::EntityTypes(EntityTypes::OntologyId), None),
            Self::Embedding => (
                Column::EntityTypeEmbeddings(EntityTypeEmbeddings::Embedding),
                None,
            ),
            Self::Schema(path) => (
                Column::EntityTypes(EntityTypes::Schema),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::ClosedSchema(path) => (
                Column::EntityTypes(EntityTypes::ClosedSchema),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::VersionedUrl => (
                Column::EntityTypes(EntityTypes::Schema),
                Some(JsonField::StaticText("$id")),
            ),
            Self::Title => (
                Column::EntityTypes(EntityTypes::Schema),
                (Some(JsonField::StaticText("title"))),
            ),
            Self::Description => (
                Column::EntityTypes(EntityTypes::Schema),
                (Some(JsonField::StaticText("description"))),
            ),
            Self::Examples => (
                Column::EntityTypes(EntityTypes::Schema),
                (Some(JsonField::StaticText("examples"))),
            ),
            Self::Required => (
                Column::EntityTypes(EntityTypes::Schema),
                (Some(JsonField::StaticText("required"))),
            ),
            Self::LabelProperty => (Column::EntityTypes(EntityTypes::LabelProperty), None),
            Self::Icon => (Column::EntityTypes(EntityTypes::Icon), None),
            Self::EditionProvenance(path) => (
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::Provenance),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => (
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata),
                None,
            ),
        }
    }
}
