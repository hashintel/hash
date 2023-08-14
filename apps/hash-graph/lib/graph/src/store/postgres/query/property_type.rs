use std::iter::once;

use crate::{
    ontology::{PropertyTypeQueryPath, PropertyTypeWithMetadata},
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
            Self::TransactionTime | Self::RecordCreatedById | Self::RecordArchivedById => vec![],
            Self::DataTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                direction: EdgeDirection::Outgoing,
                inheritance_depth: None,
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
                inheritance_depth: None,
            })
            .chain(path.relations())
            .collect(),
            Self::EntityTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsPropertiesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::EntityTypeConstrainsPropertiesOn,
                direction: EdgeDirection::Incoming,
                inheritance_depth: Some(0),
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
            Self::TransactionTime => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::TransactionTime)
            }
            Self::OwnedById => Column::OntologyOwnedMetadata(OntologyOwnedMetadata::OwnedById),
            Self::RecordCreatedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::RecordCreatedById)
            }
            Self::RecordArchivedById => {
                Column::OntologyTemporalMetadata(OntologyTemporalMetadata::RecordArchivedById)
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
