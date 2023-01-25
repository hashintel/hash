use core::marker::PhantomData;

use error_stack::Result;

use crate::{error::DeserializeError, Deserialize, Deserializer, Document, Reflection, Schema};
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

impl<T1> Reflection for (T1,)
where
    T1: Reflection + ?Sized,
{
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("array")
            .with("prefixItems", [doc.add::<T1>()])
            .with("items", false)
    }
}

impl<'de, T1> Deserialize<'de> for (T1,)
where
    T1: Deserialize<'de>,
{
    type Reflection = (T1::Reflection,);

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        todo!()
    }
}
