use std::iter::once;

use postgres_types::ToSql;

use crate::{
    knowledge::{EntityProperties, EntityQueryPath},
    ontology::EntityTypeQueryPath,
    store::postgres::query::{ColumnAccess, Path, PostgresQueryRecord, Relation, Table, TableName},
};

impl PostgresQueryRecord for EntityProperties {
    fn base_table() -> Table {
        Table {
            name: TableName::Entities,
            alias: None,
        }
    }

    fn default_selection_paths() -> &'static [Self::Path<'static>] {
        &[
            EntityQueryPath::Properties(None),
            EntityQueryPath::Uuid,
            EntityQueryPath::Version,
            EntityQueryPath::Type(EntityTypeQueryPath::VersionedUri),
            EntityQueryPath::OwnedById,
            EntityQueryPath::CreatedById,
            EntityQueryPath::UpdatedById,
        ]
    }
}

impl Path for EntityQueryPath<'_> {
    fn relations(&self) -> Vec<Relation> {
        match self {
            Self::LeftEntity(path) | Self::RightEntity(path)
                if **path == EntityQueryPath::Uuid || **path == EntityQueryPath::OwnedById =>
            {
                vec![]
            }
            Self::Type(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_type_version_id",
                },
                join_table_name: TableName::EntityTypes,
                join_column_access: EntityTypeQueryPath::VersionId.column_access(),
            })
            .chain(path.relations())
            .collect(),
            Self::LeftEntity(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "left_entity_uuid",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "entity_uuid",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::RightEntity(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "right_entity_uuid",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "entity_uuid",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::OutgoingLinks(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_uuid",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "left_entity_uuid",
                },
            })
            .chain(path.relations())
            .collect(),
            Self::IncomingLinks(path) => once(Relation {
                current_column_access: ColumnAccess::Table {
                    column: "entity_uuid",
                },
                join_table_name: TableName::Entities,
                join_column_access: ColumnAccess::Table {
                    column: "right_entity_uuid",
                },
            })
            .chain(path.relations())
            .collect(),
            _ => vec![],
        }
    }

    fn terminating_table_name(&self) -> TableName {
        match self {
            Self::Uuid
            | Self::OwnedById
            | Self::CreatedById
            | Self::UpdatedById
            | Self::Version
            | Self::Archived
            | Self::LeftOrder
            | Self::RightOrder
            | Self::Properties(_) => TableName::Entities,
            Self::Type(path) => path.terminating_table_name(),
            Self::IncomingLinks(path)
            | Self::OutgoingLinks(path)
            | Self::LeftEntity(path)
            | Self::RightEntity(path) => path.terminating_table_name(),
        }
    }

    fn column_access(&self) -> ColumnAccess {
        match self {
            Self::Uuid => ColumnAccess::Table {
                column: "entity_uuid",
            },
            Self::Version => ColumnAccess::Table { column: "version" },
            Self::Archived => ColumnAccess::Table { column: "archived" },
            Self::Type(path) => path.column_access(),
            Self::OwnedById => ColumnAccess::Table {
                column: "owned_by_id",
            },
            Self::CreatedById => ColumnAccess::Table {
                column: "created_by_id",
            },
            Self::UpdatedById => ColumnAccess::Table {
                column: "updated_by_id",
            },
            Self::LeftEntity(path) if **path == EntityQueryPath::Uuid => ColumnAccess::Table {
                column: "left_entity_uuid",
            },
            Self::RightEntity(path) if **path == EntityQueryPath::Uuid => ColumnAccess::Table {
                column: "right_entity_uuid",
            },
            Self::LeftEntity(path) if **path == EntityQueryPath::OwnedById => ColumnAccess::Table {
                column: "left_owned_by_id",
            },
            Self::RightEntity(path) if **path == EntityQueryPath::OwnedById => {
                ColumnAccess::Table {
                    column: "right_owned_by_id",
                }
            }
            Self::LeftEntity(path)
            | Self::RightEntity(path)
            | Self::IncomingLinks(path)
            | Self::OutgoingLinks(path) => path.column_access(),
            Self::LeftOrder => ColumnAccess::Table {
                column: "left_order",
            },
            Self::RightOrder => ColumnAccess::Table {
                column: "right_order",
            },
            Self::Properties(path) => path.as_ref().map_or(
                ColumnAccess::Table {
                    column: "properties",
                },
                |path| ColumnAccess::Json {
                    column: "properties",
                    field: path.as_ref(),
                },
            ),
        }
    }

    fn user_provided_path(&self) -> Option<&(dyn ToSql + Sync)> {
        if let Self::Properties(Some(field)) = self {
            Some(field)
        } else {
            None
        }
    }
}
