use core::{error::Error, fmt};

use cedar_policy_core::ast;
use error_stack::{Report, ResultExt as _};
use type_system::ontology::{BaseUrl, VersionedUrl};

use crate::policies::{
    cedar::{CedarEntityId as _, CedarExpressionVisitor, CedarExpressionVisitorError},
    resource::EntityTypeId,
};

#[derive(Debug, derive_more::Display)]
#[display("Parsing ontology id failed: {_variant}")]
pub(crate) enum ParseOntologyIdError {
    #[display("unexpected expression")]
    UnexpectedExpression,
    #[display("malformed ontology id")]
    MalformedOntologyId,
}

impl Error for ParseOntologyIdError {}

impl CedarExpressionVisitorError for ParseOntologyIdError {
    fn unexpected_expression() -> Self {
        Self::UnexpectedExpression
    }
}

pub(crate) struct EntityTypeIdVisitor;

impl CedarExpressionVisitor for EntityTypeIdVisitor {
    type Error = ParseOntologyIdError;
    type Value = VersionedUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("an entity type EUID")
    }

    fn visit_euid(&self, euid: &ast::EntityUID) -> Result<Self::Value, Report<Self::Error>> {
        Ok(EntityTypeId::from_euid(euid)
            .change_context(ParseOntologyIdError::MalformedOntologyId)?
            .into_url())
    }
}

#[derive(Debug, derive_more::Display)]
#[display("Parsing base url failed: {_variant}")]
pub(crate) enum ParseBaseUrlError {
    #[display("unexpected expression")]
    UnexpectedExpression,
    #[display("malformed base url")]
    MalformedBaseUrl,
}

impl Error for ParseBaseUrlError {}

impl CedarExpressionVisitorError for ParseBaseUrlError {
    fn unexpected_expression() -> Self {
        Self::UnexpectedExpression
    }
}

pub(crate) struct BaseUrlVisitor;

impl CedarExpressionVisitor for BaseUrlVisitor {
    type Error = ParseBaseUrlError;
    type Value = BaseUrl;

    fn expecting(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.write_str("a base url string literal")
    }

    fn visit_string(&self, string: &str) -> Result<Self::Value, Report<Self::Error>> {
        BaseUrl::new(string.to_owned()).change_context(ParseBaseUrlError::MalformedBaseUrl)
    }
}
