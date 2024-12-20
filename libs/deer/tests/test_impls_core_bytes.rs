use deer_desert::{Token, assert_tokens};

// cannot use proptest because tokenizer does not yet support borrowed data
#[test]
fn bytes_ok() {
    const EXPECTED: &[u8] = b"This is an example sentence";

    assert_tokens(&EXPECTED, &[Token::BorrowedBytes(EXPECTED)]);
}
