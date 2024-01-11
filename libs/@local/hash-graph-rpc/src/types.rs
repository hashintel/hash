pub trait HStack: Sized {
    fn push<T>(self, next: T) -> Stack<T, Self>;
}

pub struct Stack<Next, Tail> {
    pub(crate) next: Next,
    pub(crate) tail: Tail,
}

impl<Next, Tail> HStack for Stack<Next, Tail> {
    fn push<T>(self, next: T) -> Stack<T, Self> {
        Stack { next, tail: self }
    }
}

pub struct Empty;

impl HStack for Empty {
    fn push<T>(self, next: T) -> Stack<T, Self> {
        Stack { next, tail: Empty }
    }
}

#[marker]
pub trait Includes<T> {}

impl<Next, Tail> Includes<Next> for Stack<Next, Tail> {}

impl<T, Next, Tail> Includes<T> for Stack<Next, Tail> where Tail: Includes<T> {}
#[marker]
pub trait SupersetOf<T> {}

impl<T, Next, Tail> SupersetOf<Stack<Next, Tail>> for T where Self: Includes<Next> + SupersetOf<Tail>
{}

impl<T> SupersetOf<Empty> for T {}

#[macro_export]
macro_rules! stack {
    () => {
        $crate::types::Empty
    };
    ($next:ty $(,)?) => {
        $crate::types::Stack<$next, $crate::types::Empty>
    };
    ($next:ty $(, $rest:ty)+ $(,)?) => {
        $crate::types::Stack<$next, $crate::types::stack!($($rest),*)>
    };
}

pub use stack;

#[cfg(test)]
mod tests {
    use crate::types::{Empty, SupersetOf};

    type A = stack![u8, u16, u32];
    type B = stack![u8, u16, u32, u64];

    fn assert_superset<T, U>()
    where
        T: SupersetOf<U>,
    {
    }

    #[test]
    fn test() {
        assert_superset::<B, A>();
        assert_superset::<B, B>();
        assert_superset::<A, A>();
        assert_superset::<A, Empty>();
        assert_superset::<B, Empty>();

        // assert_superset::<A, B>(); // This should fail to compile
    }
}
