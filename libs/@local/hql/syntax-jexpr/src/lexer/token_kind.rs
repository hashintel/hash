use alloc::borrow::Cow;
use core::fmt::{self, Display, Write as _};

use json_number::Number;
use logos::Logos;

use super::{error::LexingError, syntax_kind::SyntaxKind};
use crate::lexer::parse::{parse_number, parse_string};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
// #[logos(error = LexingError)]
// #[logos(source = [u8])]
// #[logos(skip r"[ \t\r\n\f]+")]
pub(crate) enum TokenKind<'source> {
    // #[token("false", |_| false)]
    // #[token("true", |_| true)]
    Bool(bool),

    // #[token("null")]
    Null,

    // #[token("{")]
    LBrace,

    // #[token("}")]
    RBrace,

    // #[token("[")]
    LBracket,

    // #[token("]")]
    RBracket,

    // #[token(":")]
    Colon,

    // #[token(",")]
    Comma,

    // #[regex(r#"[0-9-]"#, parse_number)]
    Number(Cow<'source, Number>),

    // #[token(r#"""#, parse_string)]
    String(Cow<'source, str>),
}

// This is the generated code from `derive(Logos)` with the commented out code from above. This is
// needed as the `derive(Logos)` macro does not use `+ use<'s>` for the callback functions.
// TODO: Remove this once `derive(Logos)` supports `+ use<'s>` for callback functions.
//   see https://github.com/maciejhirsz/logos/issues/434
impl<'s> Logos<'s> for TokenKind<'s> {
    type Error = LexingError;
    type Extras = ();
    type Source = [u8];

    #[expect(clippy::too_many_lines)]
    fn lex(lexer: &mut ::logos::Lexer<'s, Self>) {
        use ::logos::internal::{CallbackResult as _, LexerInternal as _};
        type Lexer<'s> = ::logos::Lexer<'s, TokenKind<'s>>;

        fn end(lex: &mut Lexer<'_>) {
            lex.end();
        }

        fn error(lex: &mut Lexer<'_>) {
            lex.bump_unchecked(1);
            lex.error();
        }

        #[inline]
        fn trivia(lex: &mut Lexer<'_>) {
            lex.trivia();
            TokenKind::lex(lex);
        }

        #[inline]
        const fn pattern(byte: u8) -> bool {
            const LUT: u64 = 4_294_981_120_u64;
            match 1_u64.checked_shl(byte as u32) {
                Some(shift) => LUT & shift != 0,
                None => false,
            }
        }

        macro_rules! _fast_loop {
            ($lex:ident, $test:ident, $miss:expr) => {
                while let Some (arr) = $lex.read::<&[u8; 16]>() {
                    if $test(arr[0]) {
                        if $test(arr[1]) {
                            if $test(arr[2]) {
                                if $test(arr[3]) {
                                    if $test(arr[4]) {
                                        if $test(arr[5]) {
                                            if $test(arr[6]) {
                                                if $test(arr[7]) {
                                                    if $test(arr[8]) {
                                                        if $test(arr[9]) {
                                                            if $test(arr[10]) {
                                                                if $test(arr[11]) {
                                                                    if $test(arr[12]) {
                                                                        if $test(arr[13]) {
                                                                            if $test(arr[14]) {
                                                                                if $test(arr[15]) {
                                                                                    $lex.bump_unchecked(16);
                                                                                    continue;
                                                                                }
                                                                                $lex.bump_unchecked(15);
                                                                                return $miss;
                                                                            }
                                                                            $lex.bump_unchecked(14);
                                                                            return $miss;
                                                                        }
                                                                        $lex.bump_unchecked(13);
                                                                        return $miss;
                                                                    }
                                                                    $lex.bump_unchecked(12);
                                                                    return $miss;
                                                                }
                                                                $lex.bump_unchecked(11);
                                                                return $miss;
                                                            }
                                                            $lex.bump_unchecked(10);
                                                            return $miss;
                                                        }
                                                        $lex.bump_unchecked(9);
                                                        return $miss;
                                                    }
                                                    $lex.bump_unchecked(8);
                                                    return $miss;
                                                }
                                                $lex.bump_unchecked(7);
                                                return $miss;
                                            }
                                            $lex.bump_unchecked(6);
                                            return $miss;
                                        }
                                        $lex.bump_unchecked(5);
                                        return $miss;
                                    }
                                    $lex.bump_unchecked(4);
                                    return $miss;
                                }
                                $lex.bump_unchecked(3);
                                return $miss;
                            } $lex.bump_unchecked(2);
                            return $miss;
                        }
                        $lex.bump_unchecked(1);
                        return $miss;
                    }
                    return $miss;
                }
                while $lex.test($test) {
                    $lex.bump_unchecked(1);
                }
                $miss
            }
        }

        enum Jump {
            __,
            LBrace,
            True,
            False,
            Skip,
            Number,
            Comma,
            String,
            Null,
            LBracket,
            RBrace,
            Colon,
            RBracket,
        }

        #[rustfmt::skip]
        const LUT: [Jump; 256] = {
            use Jump::{
                __, Colon, Comma, False, LBrace, LBracket, Null, Number, RBrace, RBracket, Skip,
                String, True,
            };
            [
                __, __, __, __, __, __, __, __, __, Skip, Skip, __, Skip, Skip, __, __, // 00 - 0F
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 10 - 1F
                Skip, __, String, __, __, __, __, __, __, __, __, __, Comma, Number, __, __, // 20 - 2F
                Number, Number, Number, Number, Number, Number, Number, Number, Number, Number, Colon, __, __, __, __, __, // 30 - 3F
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 40 - 4F
                __, __, __, __, __, LBracket, __, RBracket, __, __, __, __, __, __, __, __, // 50 - 5F
                False, __, __, __, __, __, __, __, Null, __, __, __, __, __, True, __, // 60 - 6F
                __, __, __, __, __, LBrace, __, RBrace, __, __, __, __, __, __, __, __, // 70 - 7F
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 80 - 8F
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // 90 - 9F
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // A0 - AF
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // B0 - BF
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // C0 - CF
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // D0 - DF
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // E0 - EF
                __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, // F0 - FF
            ]
        };
        let Some(byte) = lexer.read::<u8>() else {
            return end(lexer);
        };

        match LUT[byte as usize] {
            Jump::Skip => {
                lexer.bump_unchecked(1);
                _fast_loop!(lexer, pattern, trivia(lexer));
            }
            Jump::Null => match lexer.read_at::<&[u8; 3]>(1) {
                Some(b"ull") => {
                    lexer.bump_unchecked(4);
                    lexer.set(Ok(TokenKind::Null));
                }
                _ => error(lexer),
            },
            Jump::False => match lexer.read_at::<&[u8; 4]>(1) {
                Some(b"alse") => {
                    lexer.bump_unchecked(5);
                    false.construct(TokenKind::Bool, lexer);
                }
                _ => error(lexer),
            },
            Jump::True => match lexer.read_at::<&[u8; 3]>(1) {
                Some(b"rue") => {
                    lexer.bump_unchecked(4);
                    true.construct(TokenKind::Bool, lexer);
                }
                _ => error(lexer),
            },
            Jump::Number => {
                lexer.bump_unchecked(1);
                parse_number(lexer).construct(TokenKind::Number, lexer);
            }
            Jump::String => {
                lexer.bump_unchecked(1);
                parse_string(lexer).construct(TokenKind::String, lexer);
            }
            Jump::Comma => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::Comma));
            }
            Jump::Colon => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::Colon));
            }
            Jump::LBrace => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::LBrace));
            }
            Jump::RBrace => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::RBrace));
            }
            Jump::LBracket => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::LBracket));
            }
            Jump::RBracket => {
                lexer.bump_unchecked(1);
                lexer.set(Ok(TokenKind::RBracket));
            }
            Jump::__ => error(lexer),
        }
    }
}

impl TokenKind<'_> {
    pub(crate) fn syntax(&self) -> SyntaxKind {
        SyntaxKind::from(self)
    }
}

impl Display for TokenKind<'_> {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Bool(bool) => Display::fmt(bool, fmt),
            Self::Null => fmt.write_str("null"),
            Self::LBrace => fmt.write_char('{'),
            Self::RBrace => fmt.write_char('}'),
            Self::LBracket => fmt.write_char('['),
            Self::RBracket => fmt.write_char(']'),
            Self::Colon => fmt.write_char(':'),
            Self::Comma => fmt.write_char(','),
            Self::Number(number) => Display::fmt(number, fmt),
            Self::String(string) => write!(fmt, "\"{string}\""),
        }
    }
}
