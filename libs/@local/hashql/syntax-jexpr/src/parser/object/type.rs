use hashql_ast::node::{
    expr::{Expr, TypeExpr},
    id::NodeId,
    r#type::Type,
};
use text_size::TextRange;

use super::{ObjectState, State, error::ObjectDiagnosticCategory, visit::Key};
use crate::{
    ParserState,
    error::ResultExt,
    lexer::{syntax_kind::SyntaxKind, syntax_kind_set::SyntaxKindSet, token_kind::TokenKind},
    parser::{
        error::{ParserDiagnostic, unexpected_token},
        string::parse_string_type,
    },
};

// The `#type` field is present
// but without `#struct`, `#dict`, `#list`, `#tuple` present
pub(crate) struct TypeNode<'heap> {
    r#type: Type<'heap>,
}

impl<'heap> State<'heap> for TypeNode<'heap> {
    fn handle(
        self,
        state: &mut ParserState<'heap, '_>,
        key: Key<'_>,
    ) -> Result<ObjectState<'heap>, ParserDiagnostic> {
        todo!()
    }

    fn build(
        self,
        state: &mut ParserState<'heap, '_>,
        span: TextRange,
    ) -> Result<Expr<'heap>, ParserDiagnostic> {
        todo!()
    }
}

// TODO: there's a fundamental problem here: how do we propagate that type up to the AST? With just
// `Type` it's going to not be representable as an expression. There needs to be a `TypeDef` and a
// type? No that's not the case, that just means we can only use function application to create
// types that way. Which isn't great per-sé, but manageable, but then again. It'd be good to have
// the ability to operate on types. But you can do that. The problem is simply the specific parsing
// here and parsing rules for e.g. struct type creation. In that sense a dedicated AST node for
// types would make things easier, but it would also kind of destroy composability. Then again it's
// the most straightforward way to do this. The problem is primarily with placement. We could
// introduce a type node that is then immediately removed upon resolving, although it's always
// easier to add something than remove, especially when trying to adhere to contract.
// The only problem I see is that we're unable to represent `["type", "name", "..."]` right now
// without such a node.
pub(crate) fn parse_type<'heap>(
    state: &mut ParserState<'heap, '_>,
) -> Result<Type<'heap>, ParserDiagnostic> {
    // right now we only support string for types that are parsed.
    let token = state.advance().change_category(From::from)?;

    #[expect(
        clippy::single_match_else,
        reason = "in the future there are going to be more cases here"
    )]
    match token.kind.syntax() {
        SyntaxKind::String => parse_string_type(state, token).change_category(From::from),
        _ => {
            let span = state.insert_range(token.span);

            Err(unexpected_token(
                span,
                ObjectDiagnosticCategory::InvalidType,
                SyntaxKindSet::from_slice(&[SyntaxKind::String]),
            )
            .map_category(From::from))
        }
    }
}
