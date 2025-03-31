use hashql_ast::node::{
    expr::{Expr, TypeExpr},
    id::NodeId,
    r#type::Type,
};
use text_size::TextRange;

use super::{
    ObjectState, State,
    error::{ObjectDiagnosticCategory, duplicate_key, unknown_key},
    visit::Key,
};
use crate::{
    ParserState,
    error::ResultExt as _,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet},
    parser::{
        error::{ParserDiagnostic, unexpected_token},
        object::error::orphaned_type,
        string::parse_string_type,
    },
};

// The `#type` field is present
// but without `#struct`, `#dict`, `#list`, `#tuple` present
pub(crate) struct TypeNode<'heap> {
    key_span: TextRange,
    value_span: TextRange,

    value: Type<'heap>,
}

impl<'heap> TypeNode<'heap> {
    pub(crate) fn parse(
        state: &mut ParserState<'heap, '_>,
        key: &Key<'_>,
    ) -> Result<Self, ParserDiagnostic> {
        let (value_span, value) = parse_type(state).change_category(From::from)?;

        Ok(Self {
            key_span: key.span,
            value_span,
            value,
        })
    }

    pub(crate) fn into_inner(self) -> Type<'heap> {
        self.value
    }
}

impl<'heap> State<'heap> for TypeNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        match &*key.value {
            "#struct" => todo!(),
            "#dict" => todo!(),
            "#list" => todo!(),
            "#tuple" => todo!(),
            "#type" => Err(duplicate_key(
                state.insert_range(self.key_span),
                state.insert_range(key.span),
                "#type",
            )
            .map_category(From::from)),
            _ => Err(unknown_key(
                state.insert_range(key.span),
                &key.value,
                &["#dict", "#struct", "#list", "#tuple"],
            )
            .map_category(From::from)),
        }
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
        _span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        // to improve error visibility, we only show the error on the key-value pair of the type
        // instead of the whole object
        let span = state.insert_range(self.key_span.cover(self.value_span));

        Err(orphaned_type(span).map_category(From::from))
    }
}

fn parse_type<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<(TextRange, Type<'heap>), ParserDiagnostic> {
    // right now we only support string for types that are parsed.
    let token = state.advance().change_category(From::from)?;
    let span = token.span;

    let r#type = if token.kind.syntax() == SyntaxKind::String {
        parse_string_type(state, token).change_category(From::from)?
    } else {
        let span = state.insert_range(token.span);

        return Err(unexpected_token(
            span,
            ObjectDiagnosticCategory::InvalidType,
            SyntaxKindSet::from_slice(&[SyntaxKind::String]),
        )
        .map_category(From::from));
    };

    Ok((span, r#type))
}
