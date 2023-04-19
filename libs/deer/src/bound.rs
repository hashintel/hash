use error_stack::Result;

use crate::{
    error::{ArrayAccessError, ObjectAccessError},
    ArrayAccess, Deserialize, FieldResult, FieldVisitor, ObjectAccess,
};

struct If<const B: bool>;
trait True {}
impl True for If<true> {}

pub struct BoundObjectAccess<A> {
    access: A,
    length: usize,

    remaining: usize,
    exhausted: bool,
}

impl<A> BoundObjectAccess<A> {
    pub(crate) fn new(access: A, length: usize) -> Self {
        Self {
            access,
            length,
            remaining: length,
            exhausted: false,
        }
    }
}

impl<'de, A> ObjectAccess<'de> for BoundObjectAccess<A>
where
    A: ObjectAccess<'de>,
{
    fn is_dirty(&self) -> bool {
        self.access.is_dirty()
    }

    fn into_bound(self, length: usize) -> Result<BoundObjectAccess<Self>, ObjectAccessError> {
        todo!("should error out")
    }

    fn field<F>(&mut self, visitor: F) -> FieldResult<'de, F>
    where
        F: FieldVisitor<'de>,
    {
        self.remaining = self.remaining.saturating_sub(1);

        if self.remaining == 0 {
            return None;
        }

        if self.exhausted {
            todo!("needs context PR")
        }

        match self.access.field(visitor) {
            None => {
                self.exhausted = true;

                todo!("needs context PR")
            }
            Some(value) => Some(value),
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.access.size_hint()
    }

    fn end(self) -> Result<(), ObjectAccessError> {
        self.access.end()
    }
}

pub struct BoundArrayAccess<A> {
    access: A,
    length: usize,

    remaining: usize,
    exhausted: bool,
}

impl<A> BoundArrayAccess<A> {
    pub(crate) fn new(access: A, length: usize) -> Self {
        Self {
            access,
            length,

            remaining: length,
            exhausted: false,
        }
    }
}

impl<'de, A> ArrayAccess<'de> for BoundArrayAccess<A>
where
    A: ArrayAccess<'de>,
{
    fn into_bound(self, _: usize) -> Result<BoundArrayAccess<Self>, ArrayAccessError> {
        todo!("should error out")
    }

    fn is_dirty(&self) -> bool {
        self.access.is_dirty()
    }

    fn next<T>(&mut self) -> Option<Result<T, ArrayAccessError>>
    where
        T: Deserialize<'de>,
    {
        self.remaining = self.remaining.saturating_sub(1);

        if self.remaining == 0 {
            return None;
        }

        if self.exhausted {
            todo!("needs context for NoneDeserializer")
        }

        match self.access.next() {
            None => {
                self.exhausted = true;
                todo!("needs context for NoneDeserializer")
            }
            Some(value) => Some(value),
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.access.size_hint()
    }

    fn end(self) -> Result<(), ArrayAccessError> {
        self.access.end()
    }
}

pub struct BoundArrayAccessChecked<A, const N: usize> {
    access: A,
    exhausted: bool,
}

impl<A, const N: usize> BoundArrayAccessChecked<A, N> {
    pub(crate) fn new(access: A, exhausted: bool) -> Self {
        Self { access, exhausted }
    }
}

impl<'de, A, const N: usize> BoundArrayAccessChecked<A, N>
where
    A: ArrayAccess<'de>,
{
    fn size_hint(&self) -> Option<usize> {
        self.access.size_hint()
    }
}

impl<'de, A, const N: usize> BoundArrayAccessChecked<A, N>
where
    A: ArrayAccess<'de>,
    If<{ N > 0 }>: True,
{
    fn next<T>(
        mut self,
    ) -> (
        BoundArrayAccessChecked<A, { N - 1 }>,
        Result<T, ArrayAccessError>,
    )
    where
        T: Deserialize<'de>,
    {
        if self.exhausted {
            // TODO: problem -> context
            // return T::deserialize(NoneDeserializer::new())
            todo!()
        }

        let value = self.access.next();

        let value = match value {
            Some(value) => value,
            None => {
                self.exhausted = true;
                // TODO: problem -> context
                todo!()
            }
        };

        (
            BoundArrayAccessChecked::new(self.access, self.exhausted),
            value,
        )
    }
}

impl<'de, A> BoundArrayAccessChecked<A, 0>
where
    A: ArrayAccess<'de>,
{
    fn end(self) -> Result<(), ArrayAccessError> {
        self.access.end()
    }
}
