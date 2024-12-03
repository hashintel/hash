use error_stack::{Frame, Report};
use serde::ser::SerializeMap;

use crate::error::{ErrorProperties, SerdeSerializeError};

#[rustfmt::skip]
macro_rules! all_the_tuples {
    ($name:ident) => {
        $name!(T1);
        $name!(T1, T2);
        $name!(T1, T2, T3);
        $name!(T1, T2, T3, T4);
        $name!(T1, T2, T3, T4, T5);
        $name!(T1, T2, T3, T4, T5, T6);
        $name!(T1, T2, T3, T4, T5, T6, T7);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15);
        $name!(T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16);
    };
}

/// internal macro to implement [`ErrorProperties`] for all tuple variants.
///
/// because it is not possible to easily implement a trait over all possible tuples this helper
/// macro is invoked for every possible tuple combination.
/// This is because there is currently no "official" support for variadic in Rust.
///
/// The support for variadic in Rust seems to have stalled,
/// the tracking issue is: <https://github.com/rust-lang/rfcs/issues/376>
///
/// For [`ErrorProperties::value`] it simply defers to the type of each element in the tuple and
/// then returns the result as a tuple, meaning
/// `(T1, ..., Tn)` -> `(T1::value(stack), ..., Tn::value(stack))`
///
/// The implementation of [`ErrorProperties::output`] functions similarly, but because the function
/// is fallible it collects all errors using [`Report::extend_one`] and checks if any errors
/// occurred.
///
/// Pseudo code implementation:
///
/// ```text
/// let (T1, ..., Tn) = value;
///
/// for T in (T1, ..., Tn) {
///     // we exploit the fact that variables and types can have the same name
///     let maybe_error = T::output(T, map);
///     error.extend_one(maybe_error);
/// }
///
/// if error {
///     Err(error)
/// } else {
///     Ok(())
/// }
/// ```
macro_rules! properties {
    ($($elem:ident),*) => {
        #[automatically_derived]
        #[expect(non_snake_case)]
        impl<$($elem),*> ErrorProperties for ($($elem,)*)
        where
            $($elem: ErrorProperties),*
        {
            type Value<'a> = ($($elem::Value<'a>,)*)
                where Self: 'a;

            fn value<'a>(stack: &[&'a Frame]) -> Self::Value<'a> {
                $(
                    let $elem = $elem::value(stack);
                )*

                ($($elem,)*)
            }

            fn output<S>(
                value: Self::Value<'_>,
                map: &mut S,
            ) -> Result<(), Report<[SerdeSerializeError]>>
            where
                S: SerializeMap,
            {
                let ($($elem,)*) = value;
                let mut errors: Option<Report<[SerdeSerializeError]>> = None;

                $(
                    if let Err(error) = $elem::output($elem, map) {
                        match &mut errors {
                            Some(errors) => {
                                errors.append(error);
                            }
                            errors => *errors = Some(error),
                        }
                    }
                )*

                errors.map_or(Ok(()), Err)
            }
        }
    };
}

all_the_tuples!(properties);

impl ErrorProperties for () {
    type Value<'a> = ();

    fn value<'a>(_: &[&'a Frame]) -> Self::Value<'a> {}

    fn output<S>((): Self::Value<'_>, _: &mut S) -> Result<(), Report<[SerdeSerializeError]>>
    where
        S: SerializeMap,
    {
        Ok(())
    }
}
