use std::borrow::Cow;

use logos::{Lexer, Logos};

macro_rules! eof {
    ($iter:ident) => {{
        let Some(item) = $iter.next() else {
            panic!("Unexpected end of input");
        };

        item
    }};
}

fn parse_string(lex: &mut Lexer<Token>) -> Result<(), ()> {
    // The lexer has encountered a string token (by using a quote - ")

    // iterate over all remaining characters, until we find the closing quote
    let mut remaining = lex.remainder();
    // TODO: problem are utf8 surrogates, we can't easily handle them here in the escape!
    let mut output = Cow::Borrowed("");

    let mut chars = remaining.char_indices();

    loop {
        let (index, char) = eof!(chars);

        match char {
            '\\' => {
                // escape sequence, next character needs to be: " \ / b f n r t (4 hex digits)
                let (index, char) = eof!(chars);
                let to_push = match char {
                    '"' | '\\' | '/' => {
                        // these are the same in rust
                        char
                    }
                    'b' => '\x08',
                    'f' => '\x0C',
                    'n' => '\n',
                    'r' => '\r',
                    't' => '\t',
                    '0'..='9' | 'a'..='f' | 'A'..='F' => {
                        // unicode escape sequence
                        // we need to read 4 hex digits
                        // they follow one after the other, so we can just read them

                        let mut until;
                        for _ in 0..3 {
                            let (index, char) = eof!(chars);
                            if char.is_ascii_hexdigit() {
                                until = index;
                            } else {
                                panic!("Invalid unicode escape sequence at index {}", index);
                            }
                        }
                        let mut slice = &remaining[index..until];

                        let codepoint = u32::from_str_radix(slice, 16).map_err(|_| ())?;
                        std::char::from_u32(codepoint).unwrap()
                    }
                    _ => panic!("Invalid escape sequence at index {}", index),
                };

                output.to_mut().push(to_push);
            }
            '"' => {
                // end of string
                break;
            }
            '\x20' | '\x21' | '\x23'..'\x5C' | '\x5D'.. => {
                // valid characters
                match &mut output {
                    Cow::Borrowed(slice) => {
                        *slice = &remaining[..index];
                    }
                    Cow::Owned(value) => {
                        value.push(char);
                    }
                }
            }
        }
    }

    // we have successfully parsed the string
    Ok(output)
}

#[derive(Debug, Logos)]
#[logos(skip r"[ \t\r\n\f]+")]
enum Token<'source> {
    #[token("false", |_| false)]
    #[token("true", |_| true)]
    Bool(bool),

    #[token("{")]
    BraceOpen,

    #[token("}")]
    BraceClose,

    #[token("[")]
    BracketOpen,

    #[token("]")]
    BracketClose,

    #[token(":")]
    Colon,

    #[token(",")]
    Comma,

    #[token("null")]
    Null,

    #[regex(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?", |lex| lex.slice().parse::<f64>().unwrap())]
    Number(f64),

    #[regex(r#""([^"\\]|\\["\\bnfrt]|u[a-fA-F0-9]{4})*""#, |lex| lex.slice())]
    String(&'source str),
}
