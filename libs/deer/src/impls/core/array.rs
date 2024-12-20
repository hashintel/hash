use core::{marker::PhantomData, mem, mem::MaybeUninit, ptr};

use error_stack::{Report, ReportSink, ResultExt as _};

use crate::{
    ArrayAccess, Deserialize, Deserializer, Document, Reflection, Schema, Visitor,
    error::{
        ArrayAccessError, ArrayLengthError, DeserializeError, ExpectedLength, Location,
        ReceivedLength, Variant as _, VisitorError,
    },
};

struct ArrayVisitor<'de, T: Deserialize<'de>, const N: usize>(PhantomData<fn(&'de ()) -> [T; N]>);

impl<'de, T: Deserialize<'de>, const N: usize> Visitor<'de> for ArrayVisitor<'de, T, N> {
    type Value = [T; N];

    fn expecting(&self) -> Document {
        <[T; N]>::reflection()
    }

    fn visit_array<A>(self, array: A) -> Result<Self::Value, Report<VisitorError>>
    where
        A: ArrayAccess<'de>,
    {
        let mut array = array.into_bound(N).change_context(VisitorError)?;
        let size_hint = array.size_hint();

        let mut result = ReportSink::new();

        #[expect(unsafe_code)]
        // SAFETY: `uninit_assumed_init` is fine here, as `[MaybeUninit<T>; N]` as no inhabitants,
        // the code shown here is also present in 1) the rust docs and 2) as an OK example in the
        // clippy docs. The code is the same as in `MaybeUninit::uninit_array()`, which is still
        // unstable
        let mut this: [MaybeUninit<T>; N] = unsafe { MaybeUninit::uninit().assume_init() };

        let mut index = 0;
        let mut failed = false;

        loop {
            let value = array.next::<T>();

            match value {
                None => break,
                Some(Ok(_)) if index >= N => {
                    // This is unreachable, as `set_bounded` guarantees that this will loop for
                    // exactly `N` times, even if more than `N` items are present it will always
                    // return `None`, therefore this case is unreachable.
                    unreachable!()
                }
                Some(Ok(value)) if !failed => {
                    this[index].write(value);
                    index += 1;
                }
                Some(Ok(_)) => {
                    // We have already failed, therefore we can just drop the item and do not need
                    // to add it to the array.
                }
                Some(Err(error)) => {
                    let error = error.attach(Location::Array(index));

                    result.append(error);

                    failed = true;
                }
            }
        }

        if let Err(error) = array.end() {
            result.append(error);
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
                result.append(error);
            }
        }

        let result = result.finish();

        // we do not need to check if we have enough items, as `set_bounded` guarantees that we
        // visit exactly `N` times and `v.end()` ensures that there aren't too many items.
        if result.is_err() {
            // we will error out, but as to not leak memory we drop all previously written items
            for item in &mut this[0..index] {
                #[expect(unsafe_code)]
                // SAFETY: we only increment the pointer once we've written a value, the array is
                // continuous, even if we error out, therefore
                unsafe {
                    ptr::drop_in_place(item.as_mut_ptr());
                }
            }
        }

        result
            .map(|()| {
                // this is taken from the source code of `array_assume_init`, which is still
                // unstable, with a bunch of of clippy suggestions, this included:
                // * `cast` instead of `*const _ as *const [T; N]`
                // * `ptr::addr_of!(array)` instead of `&array as *const _`

                #[expect(unsafe_code)]
                // SAFETY: we can guarantee that the array is fully initialized, because `result`
                // will have an error if:
                // * at least a single item had an error
                // * there are not enough items
                let ret = unsafe { ptr::addr_of!(this).cast::<[T; N]>().read() };
                #[expect(clippy::forget_non_drop)]
                // Reason: This is fine, we do **not** want to call the destructor, as we are
                // simply casting from [MaybeUninit<T>; N] to [T; N], the memory
                // layout is the same and we do not want to drop/deallocate it.
                // (This is also what `array_assume_init` does)
                mem::forget(this);
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

    fn deserialize<D: Deserializer<'de>>(
        deserializer: D,
    ) -> Result<Self, Report<DeserializeError>> {
        deserializer
            .deserialize_array(ArrayVisitor(PhantomData))
            .change_context(DeserializeError)
    }
}
