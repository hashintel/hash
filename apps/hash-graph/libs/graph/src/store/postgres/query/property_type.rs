use core::iter::once;

use crate::{
    ontology::PropertyTypeQueryPath,
    store::postgres::query::{
        table::{
            Column, JsonField, OntologyAdditionalMetadata, OntologyIds, OntologyOwnedMetadata,
            OntologyTemporalMetadata, PropertyTypeEmbeddings, PropertyTypes, ReferenceTable,
            Relation,
        },
        PostgresQueryPath,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

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
            Self::TransactionTime | Self::EditionProvenance(_) => vec![],
            Self::Embedding => vec![Relation::PropertyTypeEmbeddings],
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
            Self::OntologyId => (Column::PropertyTypes(PropertyTypes::OntologyId), None),
            Self::Embedding => (
                Column::PropertyTypeEmbeddings(PropertyTypeEmbeddings::Embedding),
                None,
            ),
            Self::Schema(path) => (
                Column::PropertyTypes(PropertyTypes::Schema),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::VersionedUrl => (
                Column::PropertyTypes(PropertyTypes::Schema),
                Some(JsonField::StaticText("$id")),
            ),
            Self::Title => (
                Column::PropertyTypes(PropertyTypes::Schema),
                Some(JsonField::StaticText("title")),
            ),
            Self::Description => (
                Column::PropertyTypes(PropertyTypes::Schema),
                Some(JsonField::StaticText("description")),
            ),
            Self::EditionProvenance(path) => (
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::Provenance),
                path.as_ref().map(JsonField::JsonPath),
            ),
            Self::DataTypeEdge { path, .. } => path.terminating_column(),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::EntityTypeEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => (
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata),
                None,
            ),
        }
    }
}
