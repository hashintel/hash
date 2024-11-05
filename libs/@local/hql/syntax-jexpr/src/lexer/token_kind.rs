use alloc::borrow::Cow;
use core::fmt::{self, Display, Write as _};

use json_number::Number;

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
#[expect(warnings, reason = "Derived through `Logos`")]
impl<'s> ::logos::Logos<'s> for TokenKind<'s> {
    type Error = LexingError;
    type Extras = ();
    type Source = [u8];

    fn lex(lex: &mut ::logos::Lexer<'s, Self>) {
        use ::logos::internal::{CallbackResult, LexerInternal};
        type Lexer<'s> = ::logos::Lexer<'s, TokenKind<'s>>;
        fn _end<'s>(lex: &mut Lexer<'s>) {
            lex.end()
        }
        fn _error<'s>(lex: &mut Lexer<'s>) {
            lex.bump_unchecked(1);
            lex.error();
        }
        macro_rules! _fast_loop { ( $   lex   :   ident   ,   $   test   :   ident   ,   $   miss   :   expr   ) =>   { while   let   Some   ( arr   ) =   $   lex   .   read   ::   <   &   [ u8   ;   16   ] >   (  ) { if   $   test   ( arr   [ 0   ] ) { if   $   test   ( arr   [ 1   ] ) { if   $   test   ( arr   [ 2   ] ) { if   $   test   ( arr   [ 3   ] ) { if   $   test   ( arr   [ 4   ] ) { if   $   test   ( arr   [ 5   ] ) { if   $   test   ( arr   [ 6   ] ) { if   $   test   ( arr   [ 7   ] ) { if   $   test   ( arr   [ 8   ] ) { if   $   test   ( arr   [ 9   ] ) { if   $   test   ( arr   [ 10   ] ) { if   $   test   ( arr   [ 11   ] ) { if   $   test   ( arr   [ 12   ] ) { if   $   test   ( arr   [ 13   ] ) { if   $   test   ( arr   [ 14   ] ) { if   $   test   ( arr   [ 15   ] ) { $   lex   .   bump_unchecked   ( 16   ) ;   continue   ;   } $   lex   .   bump_unchecked   ( 15   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 14   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 13   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 12   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 11   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 10   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 9   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 8   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 7   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 6   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 5   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 4   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 3   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 2   ) ;   return   $   miss   ;   } $   lex   .   bump_unchecked   ( 1   ) ;   return   $   miss   ;   } return   $   miss   ;   } while   $   lex   .   test   ( $   test   ) { $   lex   .   bump_unchecked   ( 1   ) ;   } $   miss   } ;   }
        #[inline]
        fn goto7_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::LBrace));
        }
        #[inline]
        fn goto5_x<'s>(lex: &mut Lexer<'s>) {
            #[inline]
            fn callback<'s>(_: &mut Lexer<'s>) -> impl CallbackResult<'s, bool, TokenKind<'s>> + use<'s> {
                true
            }
            callback(lex).construct(TokenKind::Bool, lex);
        }
        #[inline]
        fn goto17_at1<'s>(lex: &mut Lexer<'s>) {
            match lex.read_at::<&[u8; 3usize]>(1usize) {
                Some(b"rue") => {
                    lex.bump_unchecked(4usize);
                    goto5_x(lex)
                }
                _ => _error(lex),
            }
        }
        #[inline]
        fn goto4_x<'s>(lex: &mut Lexer<'s>) {
            #[inline]
            fn callback<'s>(_: &mut Lexer<'s>) -> impl CallbackResult<'s, bool, TokenKind<'s>>+ use<'s> {
                false
            }
            callback(lex).construct(TokenKind::Bool, lex);
        }
        #[inline]
        fn goto16_at1<'s>(lex: &mut Lexer<'s>) {
            match lex.read_at::<&[u8; 4usize]>(1usize) {
                Some(b"alse") => {
                    lex.bump_unchecked(5usize);
                    goto4_x(lex)
                }
                _ => _error(lex),
            }
        }
        #[inline]
        fn goto1_ctx1_x<'s>(lex: &mut Lexer<'s>) {
            lex.trivia();
            TokenKind::lex(lex);
        }
        #[inline]
        fn pattern0(byte: u8) -> bool {
            const LUT: u64 = 4294981120u64;
            match 1u64.checked_shl(byte as u32) {
                Some(shift) => LUT & shift != 0,
                None => false,
            }
        }
        #[inline]
        fn goto2_ctx1_x<'s>(lex: &mut Lexer<'s>) {
            _fast_loop!(lex, pattern0, goto1_ctx1_x(lex));
        }
        #[inline]
        fn goto13_x<'s>(lex: &mut Lexer<'s>) {
            parse_number(lex).construct(TokenKind::Number, lex);
        }
        #[inline]
        fn goto12_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::Comma));
        }
        #[inline]
        fn goto15_x<'s>(lex: &mut Lexer<'s>) {
            parse_string(lex).construct(TokenKind::String, lex);
        }
        #[inline]
        fn goto6_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::Null));
        }
        #[inline]
        fn goto18_at1<'s>(lex: &mut Lexer<'s>) {
            match lex.read_at::<&[u8; 3usize]>(1usize) {
                Some(b"ull") => {
                    lex.bump_unchecked(4usize);
                    goto6_x(lex)
                }
                _ => _error(lex),
            }
        }
        #[inline]
        fn goto9_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::LBracket));
        }
        #[inline]
        fn goto8_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::RBrace));
        }
        #[inline]
        fn goto11_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::Colon));
        }
        #[inline]
        fn goto10_x<'s>(lex: &mut Lexer<'s>) {
            lex.set(Ok(TokenKind::RBracket));
        }
        #[inline]
        fn goto19<'s>(lex: &mut Lexer<'s>) {
            enum Jump {
                __,
                J7,
                J17,
                J16,
                J2,
                J13,
                J12,
                J15,
                J18,
                J9,
                J8,
                J11,
                J10,
            }
            const LUT: [Jump; 256] = {
                use Jump::*;
                [
                    __, __, __, __, __, __, __, __, __, J2, J2, __, J2, J2, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, J2, __, J15, __, __, __, __,
                    __, __, __, __, __, J12, J13, __, __, J13, J13, J13, J13, J13, J13, J13, J13,
                    J13, J13, J11, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, J9, __, J10,
                    __, __, __, __, __, __, __, __, J16, __, __, __, __, __, __, __, J18, __, __,
                    __, __, __, J17, __, __, __, __, __, __, J7, __, J8, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __, __,
                    __, __, __, __,
                ]
            };
            let byte = match lex.read::<u8>() {
                Some(byte) => byte,
                None => return _end(lex),
            };
            match LUT[byte as usize] {
                Jump::J7 => {
                    lex.bump_unchecked(1usize);
                    goto7_x(lex)
                }
                Jump::J17 => goto17_at1(lex),
                Jump::J16 => goto16_at1(lex),
                Jump::J2 => {
                    lex.bump_unchecked(1usize);
                    goto2_ctx1_x(lex)
                }
                Jump::J13 => {
                    lex.bump_unchecked(1usize);
                    goto13_x(lex)
                }
                Jump::J12 => {
                    lex.bump_unchecked(1usize);
                    goto12_x(lex)
                }
                Jump::J15 => {
                    lex.bump_unchecked(1usize);
                    goto15_x(lex)
                }
                Jump::J18 => goto18_at1(lex),
                Jump::J9 => {
                    lex.bump_unchecked(1usize);
                    goto9_x(lex)
                }
                Jump::J8 => {
                    lex.bump_unchecked(1usize);
                    goto8_x(lex)
                }
                Jump::J11 => {
                    lex.bump_unchecked(1usize);
                    goto11_x(lex)
                }
                Jump::J10 => {
                    lex.bump_unchecked(1usize);
                    goto10_x(lex)
                }
                Jump::__ => _error(lex),
            }
        }
        goto19(lex)
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
