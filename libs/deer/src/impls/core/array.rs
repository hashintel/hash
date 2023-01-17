use core::{marker::PhantomData, mem, mem::MaybeUninit, ptr};

use error_stack::{Report, Result, ResultExt};

use crate::{
    error::{
        ArrayAccessError, ArrayLengthError, DeserializeError, ExpectedLength, Location,
        ReceivedLength, Variant, VisitorError,
    },
    ArrayAccess, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
};

struct ArrayVisitor<'de, T: Deserialize<'de>, const N: usize>(PhantomData<fn(&'de ()) -> [T; N]>);

impl<'de, T: Deserialize<'de>, const N: usize> Visitor<'de> for ArrayVisitor<'de, T, N> {
    type Value = [T; N];

    fn expecting(&self) -> Document {
        <[T; N]>::reflection()
    }

    fn visit_array<A>(self, mut v: A) -> Result<Self::Value, VisitorError>
    where
        A: ArrayAccess<'de>,
    {
        v.set_bounded(N).change_context(VisitorError)?;
        let size_hint = v.size_hint();

        let mut result: Result<(), ArrayAccessError> = Ok(());

        #[allow(unsafe_code)]
        // SAFETY: this is the same as `MaybeUninit::uninit_array()`, which is still unstable
        let mut array = unsafe { MaybeUninit::<[MaybeUninit<T>; N]>::uninit().assume_init() };

        let mut index = 0;
        let mut failed = false;

        loop {
            let value = v.next::<T>();

            match value {
                None => break,
                Some(Ok(_)) if index >= N => {
                    // This is unreachable, as `set_bounded` guarantees that this will loop for
                    // exactly `N` times, even if more than `N` items are present it will always
                    // return `None`, therefore this case is unreachable.
                    unreachable!()
                }
                Some(Ok(value)) if !failed => {
                    array[index].write(value);
                    index += 1;
                }
                Some(Ok(_)) => {
                    // We have already failed, therefore we can just drop the item and do not need
                    // to add it to the array.
                }
                Some(Err(error)) => {
                    let error = error.attach(Location::Array(index));

                    match &mut result {
                        Err(result) => result.extend_one(error),
                        result => *result = Err(error),
                    }

                    failed = true;
                }
            }
        }

        if let Err(error) = v.end() {
            match &mut result {
                Err(result) => result.extend_one(error),
                result => *result = Err(error),
            }
        }

        if let Some(size_hint) = size_hint {
            // The deserializer should emit this if there are too many, meaning we only need to emit
            // if it is less!
            if size_hint < N {
                let error = Report::new(ArrayLengthError.into_error())
                    .attach(ReceivedLength::new(size_hint))
                    .attach(ExpectedLength::new(N))
                    .change_context(ArrayAccessError);

                // we received less items, which means we can emit another error
                match &mut result {
                    Err(result) => result.extend_one(error),
                    result => *result = Err(error),
                }
            }
        }

        // we do not need to check if we have enough items, as `set_bounded` guarantees that we
        // visit exactly `N` times and `v.end()` ensures that there aren't too many items.
        if result.is_err() {
            // we will error out, but as to not leak memory we drop all previously written items
            for item in &mut array[0..index] {
                #[allow(unsafe_code)]
                // SAFETY: we only increment the pointer once we've written a value, the array is
                // continuous, even if we error out, therefore
                unsafe {
                    ptr::drop_in_place(item.as_mut_ptr());
                }
            }
        }

        result
            .map(|_| {
                // this is taken from the source code of `array_assume_init`, which is still
                // unstable, with a bunch of of clippy suggestions, this included:
                // * `cast` instead of `*const _ as *const [T; N]`
                // * `ptr::addr_of!(array)` instead of `&array as *const _`

                #[allow(unsafe_code)]
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

type UnsizedArray<T, const N: usize> = ([(); N], T);

pub struct ArrayReflection<T: Reflection + ?Sized, const N: usize>(
    PhantomData<fn() -> UnsizedArray<T, N>>,
);

impl<T: Reflection + ?Sized, const N: usize> Reflection for ArrayReflection<T, N> {
    fn schema(doc: &mut Document) -> Schema {
        // TODO: This is a super naive implementation to detect if `minItems` should be set, once
        //  more structured schemas are in place we should replace this with a proper
        //  implementation.
        let items = doc.add::<T>();
        let has_lower_bound = doc.get(items).map_or(true, |schema| schema.ty() != "none");

        let mut schema = Schema::new("array")
            .with("items", items)
            .with("maxItems", N);

        if has_lower_bound {
            schema = schema.with("minItems", N);
        }

        schema
    }
}

impl<'de, T: Deserialize<'de>, const N: usize> Deserialize<'de> for [T; N] {
    type Reflection = ArrayReflection<T::Reflection, N>;

    fn deserialize<D: Deserializer<'de>>(de: D) -> Result<Self, DeserializeError> {
        de.deserialize_array(ArrayVisitor(PhantomData::default()))
            .change_context(DeserializeError)
    }
}
