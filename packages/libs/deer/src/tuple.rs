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

macro_rules! properties {
    ($($elem:ident),*) => {
        #[automatically_derived]
        #[allow(non_snake_case)]
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
            ) -> error_stack::Result<(), SerdeSerializeError>
            where
                S: SerializeMap,
            {
                let ($($elem,)*) = value;
                let mut errors: Option<Report<SerdeSerializeError>> = None;

                $(
                    if let Err(error) = $elem::output($elem, map) {
                        match &mut errors {
                            Some(errors) => {
                                errors.extend_one(error);
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
