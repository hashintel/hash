//! Temporary helper trait for folding reports until [#2377](https://github.com/hashintel/hash/discussions/2377)
//! is resolved and implemented.

use error_stack::{Context, Report};

pub trait TupleExt {
    type Context: Context;
    type Ok;

    fn fold_reports(self) -> Result<Self::Ok, Report<Self::Context>>;
}

#[rustfmt::skip]
macro_rules! all_the_tuples {
    ($name:ident) => {
        $name!([T1], T2);
        $name!([T1, T2], T3);
        $name!([T1, T2, T3], T4);
        $name!([T1, T2, T3, T4], T5);
        $name!([T1, T2, T3, T4, T5], T6);
        $name!([T1, T2, T3, T4, T5, T6], T7);
        $name!([T1, T2, T3, T4, T5, T6, T7], T8);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8], T9);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9], T10);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10], T11);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11], T12);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12], T13);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13], T14);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14], T15);
        $name!([T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15], T16);
    };
}

impl<T1, C: Context> TupleExt for (Result<T1, Report<C>>,) {
    type Context = C;
    type Ok = (T1,);

    fn fold_reports(self) -> Result<Self::Ok, Report<Self::Context>> {
        self.0.map(|value| (value,))
    }
}

macro_rules! impl_tuple_ext {
    ([$($elem:ident),*], $other:ident) => {
        #[allow(non_snake_case)]
        impl<C: Context $(, $elem)*, $other> TupleExt for ($(Result<$elem, Report<C>>, )* Result<$other, Report<C>>) {
            type Context = C;
            type Ok = ($($elem ,)* $other);

            fn fold_reports(self) -> Result<Self::Ok, Report<Self::Context>> {
                let ( $($elem ,)* $other ) = self;

                let lhs = ( $($elem ,)* ).fold_reports();

                match (lhs, $other) {
                    (Ok(( $($elem ,)* )), Ok(rhs)) => Ok(($($elem ,)* rhs)),
                    (Ok(_), Err(err)) | (Err(err), Ok(_)) => Err(err),
                    (Err(mut lhs), Err(rhs)) => {
                        lhs.extend_one(rhs);

                        Err(lhs)
                    }
                }
            }
        }
    };
}

all_the_tuples!(impl_tuple_ext);
