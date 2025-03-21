use core::{fmt, num::TryFromIntError};

use cedar_policy_core::ast;
use error_stack::Report;
use type_system::ontology::{
    BaseUrl, VersionedUrl,
    id::{OntologyTypeVersion, ParseBaseUrlError, ParseVersionedUrlError},
};

use crate::policies::{
    cedar::{CedarEntityId as _, CedarExpressionVisitor},
    resource::EntityTypeId,
};

pub(crate) struct EntityTypeIdVisitor;

impl CedarExpressionVisitor for EntityTypeIdVisitor {
    type Error = ParseVersionedUrlError;
    type Value = VersionedUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an entity type EUID")
    }

    fn visit_euid(
        &self,
        euid: &ast::EntityUID,
    ) -> Result<Option<Self::Value>, Report<ParseVersionedUrlError>> {
        if *euid.entity_type() == **EntityTypeId::entity_type() {
            Ok(Some(EntityTypeId::from_eid(euid.eid())?.into_url()))
        } else {
            Ok(None)
        }
    }
}

pub(crate) struct BaseUrlVisitor;

impl CedarExpressionVisitor for BaseUrlVisitor {
    type Error = ParseBaseUrlError;
    type Value = BaseUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a base url string literal")
    }

    fn visit_string(&self, string: &str) -> Result<Option<Self::Value>, Report<ParseBaseUrlError>> {
        Ok(Some(BaseUrl::new(string.to_owned())?))
    }
}

pub(crate) struct OntologyTypeVersionVisitor;

impl CedarExpressionVisitor for OntologyTypeVersionVisitor {
    type Error = TryFromIntError;
    type Value = OntologyTypeVersion;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an ontology version literal")
    }

    fn visit_long(&self, long: i64) -> Result<Option<Self::Value>, Report<TryFromIntError>> {
        Ok(Some(OntologyTypeVersion::new(u32::try_from(long)?)))
    }
}
