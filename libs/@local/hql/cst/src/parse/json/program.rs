use error_stack::{Report, Result, ResultExt};
use hql_cst_lex::{Lexer, Location, SyntaxKind, TokenKind};

use super::{
    node::NodeParser,
    util::{ArrayParser, EofParser},
};
use crate::{arena::Arena, Program};

#[derive(Debug, Clone, PartialEq, Eq, Hash, thiserror::Error)]
pub enum ProgramParseError {
    #[error("unable to parse input")]
    Parse,
    #[error("expected array, but received {received}")]
    ExpectedArray { received: SyntaxKind },
    #[error("unable to parse array of nodes")]
    Array,
    #[error("expected end of input, but received {received}")]
    ExpectedEndOfInput { received: SyntaxKind },
}

pub(crate) struct ProgramParser<'arena> {
    arena: &'arena Arena,
}

impl<'arena> ProgramParser<'arena> {
    pub(crate) const fn new(arena: &'arena Arena) -> Self {
        Self { arena }
    }

    pub(crate) fn parse<'source>(
        &self,
        source: &'source str,
    ) -> Result<Program<'arena, 'source>, ProgramParseError> {
        let mut lexer = Lexer::new(source);

        let program = self.parse_program(&mut lexer)?;

        if let Some(token) = lexer.next() {
            // we would error out either way, so it's fine to propagate the error
            let token = token.change_context(ProgramParseError::Parse)?;

            return Err(Report::new(ProgramParseError::ExpectedEndOfInput {
                received: SyntaxKind::from(&token.kind),
            })
            .attach(Location::new(token.span)));
        }

        Ok(program)
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
