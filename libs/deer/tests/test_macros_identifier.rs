use deer::identifier;
use deer_desert::{Token, assert_tokens, assert_tokens_error, error};
use serde_json::json;

identifier! {
    #[derive(PartialEq, Eq)]
    #[expect(clippy::min_ident_chars, reason = "We always refer to them by Ident::")]
    pub enum Ident {
        A = "a" | b"a" | 0,
        B = "b" | b"b" | 1,
        C = "c" | b"c" | 2,
    }
}

identifier! {
    #[derive(PartialEq, Eq)]
    #[expect(clippy::min_ident_chars, reason = "We always refer to them by IdentSelect::")]
    pub enum IdentSelect {
        A = "a" | _ | _,
        B = _ | b"b" | _,
        C = _ | _ | 2,
    }
}

#[test]
fn ident_str_ok() {
    assert_tokens(&Ident::A, &[Token::Str("a")]);
    assert_tokens(&Ident::B, &[Token::Str("b")]);
    assert_tokens(&Ident::C, &[Token::Str("c")]);
}

#[test]
fn ident_str_err() {
    assert_tokens_error::<Ident>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": ["a", "b", "c"],
                "received": ["d"],
                "location": []
            }
        }]),
        &[Token::Str("d")],
    );
}

#[test]
fn ident_str_select() {
    assert_tokens(&IdentSelect::A, &[Token::Str("a")]);

    assert_tokens_error::<IdentSelect>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": ["a"],
                "received": ["b"],
                "location": []
            }
        }]),
        &[Token::Str("b")],
    );
}

#[test]
fn ident_bytes_ok() {
    assert_tokens(&Ident::A, &[Token::Bytes(b"a")]);
    assert_tokens(&Ident::B, &[Token::Bytes(b"b")]);
    assert_tokens(&Ident::C, &[Token::Bytes(b"c")]);
}

#[test]
fn ident_bytes_err() {
    assert_tokens_error::<Ident>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": [b"a", b"b", b"c"],
                "received": [b"d"],
                "location": []
            }
        }]),
        &[Token::Bytes(b"d")],
    );
}

#[test]
fn ident_bytes_select() {
    assert_tokens(&IdentSelect::B, &[Token::Bytes(b"b")]);

    assert_tokens_error::<IdentSelect>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": [b"b"],
                "received": [b"c"],
                "location": []
            }
        }]),
        &[Token::Bytes(b"c")],
    );
}

#[test]
fn ident_u64_ok() {
    assert_tokens(&Ident::A, &[Token::Number(0.into())]);
    assert_tokens(&Ident::B, &[Token::Number(1.into())]);
    assert_tokens(&Ident::C, &[Token::Number(2.into())]);
}

#[test]
fn ident_u64_err() {
    assert_tokens_error::<Ident>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": [0, 1, 2],
                "received": [3],
                "location": []
            }
        }]),
        &[Token::Number(3.into())],
    );
}

#[test]
fn ident_u64_select() {
    assert_tokens(&IdentSelect::C, &[Token::Number(2.into())]);

    assert_tokens_error::<IdentSelect>(
        &error!([{
            ns: "deer",
            id: ["unknown", "identifier"],
            properties: {
                "expected": [2],
                "received": [0],
                "location": []
            }
        }]),
        &[Token::Number(0.into())],
    );
}
