use core::{marker::PhantomData, mem, mem::MaybeUninit, ptr};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializeError, ExpectedLength, Location,
        ReceivedLength, VisitorError,
    },
    schema::BorrowReflection,
    ArrayAccess, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct ArrayVisitor<'de, T: Deserialize<'de>, const N: usize>(PhantomData<fn(&'de ()) -> [T; N]>);

impl<'de, T: Deserialize<'de>, const N: usize> Visitor<'de> for ArrayVisitor<'de, T, N> {
    type Value = [T; N];

    fn expecting(&self) -> Document {
        Document::new::<[T; N]>()
    }

    fn visit_array<A>(self, mut v: A) -> Result<Self::Value, VisitorError>
    where
        A: ArrayAccess<'de>,
    {
        let mut result: Result<(), ArrayAccessError> = Ok(());

        // SAFETY: this is the same as `MaybeUninit::uninit_array()`, which is still unstable
        let mut array = unsafe { MaybeUninit::<[MaybeUninit<T>; N]>::uninit().assume_init() };

        // we have two counters, `items` is the total amount of items we have processed, while
        // `index` is the index in the array. We know that if `index` != `items` we have failed at
        // least once, but we'd still need to dealloc all items, to do so we allocate all items
        // continuously.
        let mut index = 0;
        let mut items = 0;

        loop {
            let value = v.next::<T>();

            match value {
                None => break,
                Some(Ok(value)) => {
                    if index >= N {
                        // TODO: we need to potentially change the wording to at least / gt
                        let error = Report::new(ArrayLengthError)
                            .attach(ReceivedLength::new(v.size_hint().unwrap_or(N + 1)))
                            .attach(ExpectedLength::new(N))
                            .attach(Location::Array(index))
                            .change_context(ArrayAccessError);

                        // to avoid processing too many items we already break and add a new error
                        match &mut result {
                            Err(result) => result.extend_one(error),
                            result => *result = Err(error),
                        }

                        break;
                    }

                    array[index].write(value);
                    index += 1;
                }
                Some(Err(error)) => {
                    let error = error.attach(Location::Array(index));

                    match &mut result {
                        Err(result) => result.extend_one(error),
                        result => *result = Err(error),
                    }
                }
            }

            items += 1;
        }

        // ensure that we have enough items, `items` is always incremented, therefore we do not
        // signal a wrong warning, even if we had errors.
        if items != N {
            let error = Report::new(ArrayLengthError)
                .attach(ReceivedLength::new(items))
                .attach(ExpectedLength::new(N))
                .change_context(ArrayAccessError);

            match &mut result {
                Err(result) => result.extend_one(error),
                result => *result = Err(error),
            }
        }

        if result.is_err() {
            // we will error out, but as to not leak memory we drop all previously written items
            for item in &mut array[0..index] {
                // SAFETY: we only increment the pointer once we've written a value, the array is
                // continuous, even if we error out, therefore
                unsafe { ptr::drop_in_place(item.as_mut_ptr()) }
            }
        }

        result
            .map(|_| {
                // this is taken from the source code of `array_assume_init`, which is still
                // unstable, with a bunch of of clippy suggestions, this included:
                // * `cast` instead of `*const _ as *const [T; N]`
                // * `ptr::addr_of!(array)` instead of `&array as *const _`

                // SAFETY: we can guarantee that the array is fully initialized, because `result`
                // will have an error if:
                // * at least a single item had an error
                // * there are not enough items
                let ret = unsafe { ptr::addr_of!(array).cast::<[T; N]>().read() };
                mem::forget(array);
                ret
            })
            .change_context(VisitorError)
    }
}

struct ArrayReflection<'de, T: Deserialize<'de>, const N: usize>(
    PhantomData<fn(&'de ()) -> [T; N]>,
);

impl Reflection for ArrayReflection {
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("array")
            .with("items", doc.add::<T::Reflection>())
            .with("minItems", N)
            .with("maxItems", N)
    }
}

impl<T: BorrowReflection, const N: usize> Reflection for [T; N] {
    fn schema(doc: &mut Document) -> Schema {
        Schema::new("array")
            .with("items", doc.add::<T::Reflection>())
            .with("minItems", N)
            .with("maxItems", N)
    }
}

impl<'de, T: Deserialize<'de>, const N: usize> Deserialize<'de> for [T; N] {
    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_array(ArrayVisitor(PhantomData::default()))
            .change_context(DeserializeError)
    }
}
