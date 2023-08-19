use core::marker::PhantomData;

use deer_desert::{assert_tokens, Token};

#[test]
fn phantom_data_ok() {
    assert_tokens::<PhantomData<u64>>(&PhantomData, &[Token::Null]);
}
