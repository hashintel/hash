use error_stack::TryReportTupleExt as _;

use super::{LoweredResult, Lowering};
use crate::{
    Pagination, RestAuth, RestSource,
    issue::{DefinitionPath, IssueKind, SourceLocation},
    yaml::syntax::{
        PaginationKindSyntax, PaginationSyntax, RestAuthKindSyntax, RestAuthSyntax,
        RestSourceSyntax,
    },
};

impl RestSourceSyntax {
    pub(super) fn lower(
        &self,
        lowering: &mut Lowering,
        path: &DefinitionPath,
    ) -> LoweredResult<RestSource> {
        let url = lowering.text(&self.url, &path.clone().field("url"));
        let params = lowering.entries(
            &self.params,
            &path.clone().field("params"),
            |_lowering, text, _path| Ok(text),
            Lowering::text,
        );
        let auth = self
            .auth
            .as_ref()
            .map(|auth| {
                let path = path.clone().field("auth");
                lowering.record_location(&path, SourceLocation::from_spanned(auth));
                auth.value.lower(lowering, &path)
            })
            .transpose();
        let results_field = self
            .results_field
            .as_ref()
            .map(|field| lowering.text(field, &path.clone().field("resultsField")))
            .transpose();
        let pagination = self
            .pagination
            .as_ref()
            .map(|pagination| {
                let path = path.clone().field("pagination");
                lowering.record_location(&path, SourceLocation::from_spanned(pagination));
                pagination.value.lower(lowering, &path)
            })
            .transpose();
        let (url, params, auth, results_field, pagination) =
            (url, params, auth, results_field, pagination).try_collect()?;
        Ok(RestSource {
            url,
            params,
            auth,
            results_field,
            pagination,
            page_size: self.page_size,
            max_pages: self.max_pages,
            rate_limit_ms: self.rate_limit_ms,
        })
    }
}

impl RestAuthSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> LoweredResult<RestAuth> {
        match self.kind {
            RestAuthKindSyntax::Header => {
                let name = self.name.as_ref().ok_or_else(|| {
                    lowering.report(path.clone(), IssueKind::MissingField { field: "name" })
                })?;
                Ok(RestAuth::Header {
                    name: lowering.text(name, &path.clone().field("name"))?,
                    secret_entity_uuid: self.secret_entity_uuid,
                })
            }
            RestAuthKindSyntax::Bearer => {
                if let Some(name) = &self.name {
                    let path = path.clone().field("name");
                    lowering.record_location(&path, SourceLocation::from_spanned(name));
                    return Err(lowering.report(path, IssueKind::UnexpectedField { field: "name" }));
                }
                Ok(RestAuth::Bearer {
                    secret_entity_uuid: self.secret_entity_uuid,
                })
            }
        }
    }
}

impl PaginationSyntax {
    fn lower(&self, lowering: &mut Lowering, path: &DefinitionPath) -> LoweredResult<Pagination> {
        match self.kind {
            PaginationKindSyntax::NextLink => {
                let field = self.field.as_ref().ok_or_else(|| {
                    lowering.report(path.clone(), IssueKind::MissingField { field: "field" })
                })?;
                Ok(Pagination::NextLink {
                    field: lowering.text(field, &path.clone().field("field"))?,
                })
            }
            PaginationKindSyntax::Offset => {
                if let Some(field) = &self.field {
                    let path = path.clone().field("field");
                    lowering.record_location(&path, SourceLocation::from_spanned(field));
                    return Err(
                        lowering.report(path, IssueKind::UnexpectedField { field: "field" })
                    );
                }
                Ok(Pagination::Offset)
            }
        }
    }
}
