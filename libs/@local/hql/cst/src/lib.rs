use justjson::parser::{Token, Tokenizer};
use winnow::{
    combinator::{delimited, opt, separated},
    token, Parser,
};

// TODO: do we want instead to use the justjson visitor API? (probably)
fn parse_expr() {}

fn parse_string_literal() {
    // TODO: is this correct?!
    return token::any.try_map(|token: Token| {
        if let Token::String(s) = token {
            Ok(s)
        } else {
            // TODO: proper error w/ location
            Err("Expected string literal".to_string())
        }
    });
}

fn parse_function_call(tokenizer: &mut Tokenizer<true>) {
    delimited(
        Token::Array,
        (
            parse_string_literal(), // first argument is a string literal
            opt((
                token::literal(Token::Comma),
                separated(0.., parse_expr(), Token::Comma),
            )),
            opt(token::literal(Token::Comma)), // optional trailing comma
        ),
        Token::ArrayEnd,
    );
    // TODO: arguments
}
