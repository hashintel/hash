use core::marker::PhantomData;

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayLengthError, DeserializeError, ExpectedLength, ReceivedLength, Variant, VisitorError,
    },
    ext::TupleExt,
    ArrayAccess, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

#[rustfmt::skip]
macro_rules! all_the_tuples {
    ($name:ident) => {
        $name!( 1, V01, R01; T1);
        $name!( 2, V02, R02; T1, T2);
        $name!( 3, V03, R03; T1, T2, T3);
        $name!( 4, V04, R04; T1, T2, T3, T4);
        $name!( 5, V05, R05; T1, T2, T3, T4, T5);
        $name!( 6, V06, R06; T1, T2, T3, T4, T5, T6);
        $name!( 7, V07, R07; T1, T2, T3, T4, T5, T6, T7);
        $name!( 8, V08, R08; T1, T2, T3, T4, T5, T6, T7, T8);
        $name!( 9, V09, R09; T1, T2, T3, T4, T5, T6, T7, T8, T9);
        $name!(10, V10, R10; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10);
        $name!(11, V11, R11; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11);
        $name!(12, V12, R12; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12);
        $name!(13, V13, R13; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13);
        $name!(14, V14, R14; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14);
        $name!(15, V15, R15; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15);
        $name!(16, V16, R16; T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16);
    };
}

macro_rules! impl_tuple {
    ($expected:literal, $visitor:ident, $reflection:ident; $($elem:ident),*) => {
        pub struct $reflection<$($elem: ?Sized,)*>($(PhantomData<fn() -> *const $elem>,)*);

        impl<$($elem,)*> Reflection for $reflection<$($elem,)*>
        where
            $($elem: Reflection + ?Sized),*
        {
            fn schema(doc: &mut Document) -> Schema {
                Schema::new("array")
                    .with("prefixItems", [$(doc.add::<$elem>()),*])
                    .with("items", false)
            }
        }


        // we do not use &'de as the return type, as that would mean that `Deserialize<'de>`
        // must be `'de`, which we cannot guarantee
        struct $visitor<'de, $($elem,)*>(PhantomData<fn() -> *const (&'de (), $($elem,)*)>)
            where $($elem: Deserialize<'de>,)*;


        #[automatically_derived]
        impl<'de, $($elem,)*> Visitor<'de> for $visitor<'de, $($elem,)*>
        where
            $($elem: Deserialize<'de>),*
        {
            type Value = ($($elem,)*);

            fn expecting(&self) -> Document {
                Self::Value::reflection()
            }

            #[allow(non_snake_case)]
            fn visit_array<T>(self, mut v: T) -> Result<Self::Value, VisitorError>
            where
                T: ArrayAccess<'de>,
            {
                let mut length = 0;

                $(
                let $elem = match v.next() {
                    None => {
                        return Err(Report::new(ArrayLengthError.into_error())
                            .attach(ExpectedLength::new($expected))
                            .attach(ReceivedLength::new(length))
                            .change_context(VisitorError));
                    }
                    Some(value) => value,
                };

                length += 1;
                )*

                let value = ($($elem,)*).fold_reports();

                (value, v.end())
                    .fold_reports()
                    .map(|(value, _)| value)
                    .change_context(VisitorError)
            }
        }

        impl<'de, $($elem,)*> Deserialize<'de> for ($($elem,)*)
        where
            $($elem: Deserialize<'de>),*
        {
            type Reflection = $reflection<$($elem::Reflection),*>;

            fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
                de.deserialize_array($visitor::<'de, $($elem,)*>(PhantomData))
                            .change_context(DeserializeError)
            }
        }
    };
}

all_the_tuples!(impl_tuple);
