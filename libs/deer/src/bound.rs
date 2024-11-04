use error_stack::{Report, ResultExt as _};

use crate::{
    ArrayAccess, Context, Deserialize, FieldVisitor, ObjectAccess,
    error::{ArrayAccessError, BoundedContractViolationError, ObjectAccessError, Variant as _},
    value::NoneDeserializer,
};

pub struct BoundObjectAccess<A> {
    access: A,

    remaining: usize,
    exhausted: bool,
}

impl<A> BoundObjectAccess<A> {
    pub(crate) const fn new(access: A, length: usize) -> Self {
        Self {
            access,
            remaining: length,
            exhausted: false,
        }
    }
}

impl<'de, A> BoundObjectAccess<A>
where
    A: ObjectAccess<'de>,
{
    // TODO: in struct derive, have option for none! (or should we just not use bounded in that
    //  case?)
    fn visit_none<F>(&self, visitor: F) -> Result<F::Value, Report<ObjectAccessError>>
    where
        F: FieldVisitor<'de>,
    {
        let key = visitor
            .visit_key(NoneDeserializer::new(self.context()))
            .change_context(ObjectAccessError)?;

        visitor
            .visit_value(key, NoneDeserializer::new(self.context()))
            .change_context(ObjectAccessError)
    }
}

impl<'de, A> ObjectAccess<'de> for BoundObjectAccess<A>
where
    A: ObjectAccess<'de>,
{
    fn is_dirty(&self) -> bool {
        self.access.is_dirty()
    }

    fn context(&self) -> &Context {
        self.access.context()
    }

    fn into_bound(self, _: usize) -> Result<BoundObjectAccess<Self>, Report<ObjectAccessError>> {
        Err(
            Report::new(BoundedContractViolationError::SetCalledMultipleTimes.into_error())
                .change_context(ObjectAccessError),
        )
    }

    fn try_field<F>(&mut self, visitor: F) -> Result<Result<F::Value, Report<ObjectAccessError>>, F>
    where
        F: FieldVisitor<'de>,
    {
        if self.remaining == 0 {
            return Err(visitor);
        }

        self.remaining = self.remaining.saturating_sub(1);

        if self.exhausted {
            return Ok(self.visit_none(visitor));
        }

        match self.access.try_field(visitor) {
            Err(visitor) => {
                self.exhausted = true;

                Ok(self.visit_none(visitor))
            }
            Ok(value) => Ok(value),
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.access.size_hint()
    }

    fn end(self) -> Result<(), Report<ObjectAccessError>> {
        let mut result = self.access.end().map_err(Report::expand);

        if self.remaining > 0 {
            let error = Report::new(BoundedContractViolationError::EndRemainingItems.into_error())
                .change_context(ObjectAccessError);

            match &mut result {
                Err(result) => result.push(error),
                result => *result = Err(error.expand()),
            }
        }

        result.change_context(ObjectAccessError)
    }
}

pub struct BoundArrayAccess<A> {
    access: A,

    remaining: usize,
    exhausted: bool,
}

impl<A> BoundArrayAccess<A> {
    pub(crate) const fn new(access: A, length: usize) -> Self {
        Self {
            access,

            remaining: length,
            exhausted: false,
        }
    }
}

impl<'de, A> ArrayAccess<'de> for BoundArrayAccess<A>
where
    A: ArrayAccess<'de>,
{
    fn is_dirty(&self) -> bool {
        self.access.is_dirty()
    }

    fn context(&self) -> &Context {
        self.access.context()
    }

    fn into_bound(self, _: usize) -> Result<BoundArrayAccess<Self>, Report<ArrayAccessError>> {
        Err(
            Report::new(BoundedContractViolationError::SetCalledMultipleTimes.into_error())
                .change_context(ArrayAccessError),
        )
    }

    fn next<T>(&mut self) -> Option<Result<T, Report<ArrayAccessError>>>
    where
        T: Deserialize<'de>,
    {
        if self.remaining == 0 {
            return None;
        }

        self.remaining = self.remaining.saturating_sub(1);

        if self.exhausted {
            return Some(
                T::deserialize(NoneDeserializer::new(self.context()))
                    .change_context(ArrayAccessError),
            );
        }

        match self.access.next() {
            None => {
                self.exhausted = true;

                Some(
                    T::deserialize(NoneDeserializer::new(self.context()))
                        .change_context(ArrayAccessError),
                )
            }
            Some(value) => Some(value),
        }
    }

    fn size_hint(&self) -> Option<usize> {
        self.access.size_hint()
    }

    fn end(self) -> Result<(), Report<ArrayAccessError>> {
        let mut result = self.access.end().map_err(Report::expand);

        if self.remaining > 0 {
            let error = Report::new(BoundedContractViolationError::EndRemainingItems.into_error())
                .change_context(ArrayAccessError);

            match &mut result {
                Err(result) => result.push(error),
                result => *result = Err(error.expand()),
            }
        }

        result.change_context(ArrayAccessError)
    }
}
