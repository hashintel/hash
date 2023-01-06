use core::fmt::Debug;

use deer::{error::ReportExt, Context, Deserialize};
use serde_json::to_value;

use crate::{deserializer::Deserializer, token::Token};

pub fn assert_tokens_with_context<'de, T>(expected: &T, tokens: &'de [Token], context: &Context)
where
    T: Deserialize<'de> + PartialEq + Debug,
{
    let mut de = Deserializer::new(tokens, context);
    let received = T::deserialize(&mut de).expect("should deserialize");

    if de.remaining() > 0 {
        panic!("{} remaining tokens", de.remaining());
    }

    assert_eq!(received, *expected);
}

pub fn assert_tokens<'de, T>(value: &T, tokens: &'de [Token])
where
    T: Deserialize<'de> + PartialEq + Debug,
{
    assert_tokens_with_context(value, tokens, &Context::new());
}

pub fn assert_tokens_with_context_error<'de, T>(
    error: &serde_json::Value,
    tokens: &'de [Token],
    context: &Context,
) where
    T: Deserialize<'de> + Debug,
{
    let mut de = Deserializer::new(tokens, context);
    let received = T::deserialize(&mut de).expect_err("value of type T should fail serialization");

    let received = received.export();
    let received = to_value(received).expect("error should serialize");

    assert_eq!(received, *error)
}

pub fn assert_tokens_error<'de, T>(error: &serde_json::Value, tokens: &'de [Token])
where
    T: Deserialize<'de> + Debug,
{
    assert_tokens_with_context_error::<T>(error, tokens, &Context::new());
}
