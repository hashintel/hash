use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, TokenKind};

use super::{
    node::NodeParser,
    util::{ArrayParser, EofParser},
};
use crate::{arena::Arena, Program};

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub(crate) enum ProgramParseError {
    #[error("unable to parse input")]
    Parse,
    #[error("expected array, but received {received}")]
    ExpectedArray { received: SyntaxKind },
    #[error("unable to parse array of nodes")]
    Array,
}

pub(crate) struct ProgramParser<'arena> {
    arena: &'arena Arena,
}

impl<'arena> ProgramParser<'arena> {
    pub(crate) fn new(arena: &'arena Arena) -> Self {
        Self { arena }
    }

    pub(crate) fn parse_program<'source>(
        &self,
        lexer: &mut Lexer<'source>,
    ) -> Result<Program<'arena, 'source>, ProgramParseError> {
        let token = {
            let mut eof = EofParser { lexer };
            eof.advance().change_context(ProgramParseError::Parse)?
        };

        if token.kind != TokenKind::LBracket {
            return Err(Report::new(ProgramParseError::ExpectedArray {
                received: SyntaxKind::from(&token.kind),
            }))
            .attach(Location::new(token.span));
        }

        let mut nodes = self.arena.vec(None);
        let span = ArrayParser::new(lexer)
            .parse(token, |lexer, token| {
                let node = NodeParser::new(self.arena).parse_node(lexer, token)?;
                nodes.push(node);
                Ok(())
            })
            .change_context(ProgramParseError::Array)?;

        Ok(Program { nodes, span })
    }
}
