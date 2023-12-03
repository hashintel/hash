use std::iter::once;

use graph_types::ontology::DataTypeWithMetadata;

use crate::{
    ontology::DataTypeQueryPath,
    store::postgres::query::{
        table::{
            Column, DataTypes, JsonField, OntologyAdditionalMetadata, OntologyIds,
            OntologyOwnedMetadata, OntologyTemporalMetadata, ReferenceTable, Relation,
        },
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::{EdgeDirection, OntologyEdgeKind},
};

impl PostgresRecord for DataTypeWithMetadata {
    fn base_table() -> Table {
        Table::OntologyTemporalMetadata
    }
}

impl PostgresQueryPath for DataTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::OntologyId
            | Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Type
            | Self::Schema(_) => vec![Relation::DataTypeIds],
            Self::BaseUrl | Self::Version => vec![Relation::OntologyIds],
            Self::OwnedById => vec![Relation::OntologyOwnedMetadata],
            Self::AdditionalMetadata => vec![Relation::OntologyAdditionalMetadata],
            Self::TransactionTime | Self::RecordCreatedById | Self::RecordArchivedById => vec![],
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                direction: EdgeDirection::Incoming,
            })
            .chain(path.relations())
            .collect(),
            Self::PropertyTypeEdge { .. } => unreachable!("Invalid path: {self}"),
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
            Self::OntologyId => Column::DataTypes(DataTypes::OntologyId),
            Self::Schema(path) => path
                .as_ref()
                .map_or(Column::DataTypes(DataTypes::Schema(None)), |path| {
                    Column::DataTypes(DataTypes::Schema(Some(JsonField::JsonPath(path))))
                }),
            Self::VersionedUrl => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("$id"))))
            }
            Self::Title => {
                Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("title"))))
            }
            Self::Type => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText("type")))),
            Self::Description => Column::DataTypes(DataTypes::Schema(Some(JsonField::StaticText(
                "description",
            )))),
            Self::PropertyTypeEdge { path, .. } => path.terminating_column(),
            Self::AdditionalMetadata => {
                Column::OntologyAdditionalMetadata(OntologyAdditionalMetadata::AdditionalMetadata)
            }
        }
    }
}
