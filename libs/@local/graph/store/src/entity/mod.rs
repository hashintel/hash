pub use self::{
    query::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        EntityQuerySortingToken, EntityQueryToken,
    },
    store::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DeleteEntitiesParams,
        DeletionScope, DeletionSummary, DiffEntityParams, DiffEntityResult, EntityPermissions,
        EntityStore, EntityValidationType, HasPermissionForEntitiesParams, LinkDeletionBehavior,
        PatchEntityParams, QueryConversion, QueryEntitiesParams, QueryEntitiesResponse,
        QueryEntitySubgraphParams, QueryEntitySubgraphResponse, UpdateEntityEmbeddingsParams,
        ValidateEntityComponents, ValidateEntityError, ValidateEntityParams,
    },
    validation_report::{
        EmptyEntityTypes, EntityRetrieval, EntityTypeRetrieval, EntityTypesError,
        EntityValidationReport, LinkDataStateError, LinkDataValidationReport, LinkError,
        LinkTargetError, LinkValidationReport, LinkedEntityError, MetadataValidationReport,
        MissingLinkData, PropertyMetadataValidationReport, UnexpectedEntityType,
        UnexpectedLinkData,
    },
};

mod query;
mod store;
mod validation_report;

use type_system::knowledge::Entity;

use crate::filter::QueryRecord;

impl QueryRecord for Entity {
    type QueryPath<'p> = EntityQueryPath<'p>;
}
