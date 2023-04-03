use proc_macro::{Ident, TokenTree};
use virtue::prelude::*;

#[derive(Debug)]
pub(crate) struct QueryBuilderInput {
    pub(crate) variants: Vec<QueryBuilderVariant>,
}

#[derive(Debug)]
pub(crate) enum Next {
    This,
    Nest,
    Properties,
}

#[derive(Debug)]
pub(crate) enum Redirect {
    Remote(Vec<TokenTree>),
    This,
}

#[derive(Debug)]
pub(crate) enum QueryBuilderField {
    Bottom,
    Redirect(Redirect),
    // TODO: EntityEdge, EntityTypeEdge
    Complex,
    Properties,
    Skip,
}

#[derive(Debug)]
pub(crate) struct QueryBuilderVariant {
    pub(crate) name: Ident,
    pub(crate) field: QueryBuilderField,
}
