#[cfg(feature = "utoipa")]
pub use self::store::CreateEntityRequest;
pub use self::{
    query::{
        EntityQueryCursor, EntityQueryPath, EntityQuerySorting, EntityQuerySortingRecord,
        EntityQuerySortingToken, EntityQueryToken,
    },
    store::{
        ClosedMultiEntityTypeMap, CountEntitiesParams, CreateEntityParams, DiffEntityParams,
        DiffEntityResult, EntityStore, EntityValidationType, GetEntitiesParams,
        GetEntitiesResponse, GetEntitySubgraphParams, GetEntitySubgraphResponse,
        HasPermissionForEntitiesParams, PatchEntityParams, QueryConversion,
        UpdateEntityEmbeddingsParams, ValidateEntityComponents, ValidateEntityError,
        ValidateEntityParams,
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
