use core::fmt::Debug;

use deer::{error::ReportExt, Context, Deserialize};
use serde_json::to_value;
#[cfg(feature = "pretty")]
use similar_asserts::{assert_eq, assert_serde_eq};

use crate::{deserializer::Deserializer, error::ErrorVec, token::Token};

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
    error: &ErrorVec,
    tokens: &'de [Token],
    context: &Context,
) where
    T: Deserialize<'de> + Debug,
{
    let mut de = Deserializer::new(tokens, context);
    let received = T::deserialize(&mut de).expect_err("value of type T should fail serialization");

    let received = received.export();
    let received = to_value(received).expect("error should serialize");
    let errors = ErrorVec::from_value(&received).expect("well-formed error object");

    #[cfg(not(feature = "pretty"))]
    assert_eq!(errors, *error);

    #[cfg(feature = "pretty")]
    assert_serde_eq!(errors, *error);
}

pub fn assert_tokens_error<'de, T>(error: &ErrorVec, tokens: &'de [Token])
where
    T: Deserialize<'de> + Debug,
{
    assert_tokens_with_context_error::<T>(error, tokens, &Context::new());
}
