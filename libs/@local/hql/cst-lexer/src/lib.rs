use core::str;
use std::borrow::Cow;

use logos::{Lexer, Logos};

macro_rules! eof {
    ($bytes:ident) => {{
        let Some((&byte, remainder)) = $bytes.split_first() else {
            panic!("Unexpected end of input");
        };

        $bytes = remainder;
        byte
    }};
}

fn parse_escape() {}

fn parse_byte(current: u8, remainder: &mut &[u8]) {
    // lookup ASCII characters
    match current {
        0x20 | 0x21 | 0x23..=0x5B | 0x5D..=0x7F => {
            // valid unicode characters, therefore we can just push them
            current
        }
        b'"' => {
            // closing quote
            break;
        }
        b'\\' => {
            // escape sequence
            let next = eof!(remainder);
            match next {
                b'"' | b'\\' | b'/' => next,
                b'b' => b'\x08',
                b'f' => b'\x0C',
                b'n' => b'\n',
                b'r' => b'\r',
                b't' => b'\t',
                b'u' => {
                    // unicode escape sequence
                    // we need to read 4 hex digits
                    // they follow one after the other, so we can just read them

                    let mut codepoint = 0;
                    for _ in 0..4 {
                        let next = eof!(remainder);
                        let digit = match next {
                            b'0'..=b'9' => next - b'0',
                            b'a'..=b'f' => next - b'a' + 10,
                            b'A'..=b'F' => next - b'A' + 10,
                            _ => panic!("Invalid unicode escape sequence"),
                        };

                        codepoint = codepoint * 16 + digit as u32;
                    }

                    codepoint
                }
                _ => panic!("Invalid escape sequence"),
            }
        }
    }
}

fn parse_string(lex: &mut Lexer<Token>) -> Result<(), ()> {
    // The lexer has encountered a string token (by using a quote - ")

    // iterate over all remaining characters, until we find the closing quote
    let mut remaining = lex.remainder();
    // TODO: problem are utf8 surrogates, we can't easily handle them here in the escape!
    let mut output = Cow::Borrowed(&[]);

    let mut bytes = remaining.as_bytes();
    loop {
        let byte = eof!(bytes);

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
