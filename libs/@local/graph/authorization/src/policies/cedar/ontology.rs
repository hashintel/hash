use core::{fmt, num::TryFromIntError};

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    id::{OntologyTypeVersion, ParseBaseUrlError, ParseVersionedUrlError},
};

use crate::policies::{
    cedar::{CedarExpressionVisitor, FromCedarEntityId as _},
    resource::EntityTypeId,
};

pub(crate) struct EntityTypeIdVisitor;

impl CedarExpressionVisitor for EntityTypeIdVisitor {
    type Error = Report<ParseVersionedUrlError>;
    type Value = VersionedUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an entity type EUID")
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Option<Result<Self::Value, Self::Error>> {
        (*euid.entity_type() == **EntityTypeId::entity_type())
            .then(|| EntityTypeId::from_eid(euid.eid()).map(EntityTypeId::into_url))
    }
}

pub(crate) struct BaseUrlVisitor;

impl CedarExpressionVisitor for BaseUrlVisitor {
    type Error = Report<ParseBaseUrlError>;
    type Value = BaseUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a base url string literal")
    }

    fn visit_string(&self, string: &str) -> Option<Result<Self::Value, Self::Error>> {
        Some(BaseUrl::new(string.to_owned()).map_err(Report::new))
    }
}

pub(crate) struct OntologyTypeVersionVisitor;

impl CedarExpressionVisitor for OntologyTypeVersionVisitor {
    type Error = Report<TryFromIntError>;
    type Value = OntologyTypeVersion;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an ontology version literal")
    }

    fn visit_long(&self, long: i64) -> Option<Result<Self::Value, Self::Error>> {
        Some(
            u32::try_from(long)
                .map(OntologyTypeVersion::new)
                .map_err(Report::new),
        )
    }
}
