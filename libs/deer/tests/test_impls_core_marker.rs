use core::marker::PhantomData;

use deer_desert::{Token, assert_tokens};

#[test]
fn phantom_data_ok() {
    assert_tokens::<PhantomData<u64>>(&PhantomData, &[Token::Null]);
}
