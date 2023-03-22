use std::iter::once;

use crate::{
    ontology::{DataTypeQueryPath, DataTypeWithMetadata},
    store::postgres::query::{
        table::{Column, DataTypes, JsonField, OntologyIds, ReferenceTable, Relation},
        PostgresQueryPath, PostgresRecord, Table,
    },
    subgraph::edges::OntologyEdgeKind,
};

impl PostgresRecord for DataTypeWithMetadata {
    fn base_table() -> Table {
        Table::DataTypes
    }
}

impl PostgresQueryPath for DataTypeQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::VersionedUrl
            | Self::Title
            | Self::Description
            | Self::Type
            | Self::OntologyId
            | Self::Schema(_) => vec![],
            Self::BaseUrl
            | Self::Version
            | Self::TransactionTime
            | Self::UpdatedById
            | Self::OwnedById
            | Self::AdditionalMetadata(_) => {
                vec![Relation::DataTypeIds]
            }
            Self::PropertyTypeEdge {
                edge_kind: OntologyEdgeKind::ConstrainsValuesOn,
                path,
            } => once(Relation::Reference {
                table: ReferenceTable::PropertyTypeConstrainsValuesOn,
                reversed: true,
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
            Self::TransactionTime => Column::OntologyIds(OntologyIds::TransactionTime),
            Self::OwnedById => Column::OntologyIds(OntologyIds::AdditionalMetadata(Some(
                JsonField::StaticText("owned_by_id"),
            ))),
            Self::UpdatedById => Column::OntologyIds(OntologyIds::UpdatedById),
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
