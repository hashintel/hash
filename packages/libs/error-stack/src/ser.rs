use std::{
    any::{Any, TypeId},
    collections::HashMap,
    marker::PhantomData,
    mem,
    sync::Arc,
};

use erased_serde::Serializer;

use crate::Frame;

pub trait Hook<T> {
    fn call(&self, frame: &T, serializer: &mut dyn Serializer) -> Option<erased_serde::Result<()>>;
}

impl<F, T> Hook<T> for F
where
    F: Fn(&T, &mut dyn Serializer) -> erased_serde::Result<()>,
    T: Send + Sync + 'static,
{
    fn call(&self, frame: &T, serializer: &mut dyn Serializer) -> Option<erased_serde::Result<()>> {
        Some((self)(frame, serializer))
    }
}

pub struct Stack<L, T, R> {
    left: L,
    right: R,
    _marker: PhantomData<T>,
}

impl<L, T, R> Hook<Frame> for Stack<L, T, R>
where
    L: Hook<T>,
    T: Send + Sync + 'static,
    R: Hook<Frame>,
{
    fn call(
        &self,
        frame: &Frame,
        serializer: &mut dyn Serializer,
    ) -> Option<erased_serde::Result<()>> {
        if let Some(frame) = frame.downcast_ref::<T>() {
            self.left.call(frame, serializer)
        } else {
            self.right.call(frame, serializer)
        }
    }
}

impl<T> Hook<T> for () {
    fn call(&self, _: &T, _: &mut dyn Serializer) -> Option<erased_serde::Result<()>> {
        None
    }
}

impl Hook<Frame> for Box<dyn Hook<Frame>> {
    fn call(
        &self,
        frame: &Frame,
        serializer: &mut dyn Serializer,
    ) -> Option<erased_serde::Result<()>> {
        let hook = self.as_ref();

        hook.call(frame, serializer)
    }
}

struct Hooks(Box<dyn Hook<Frame>>);

impl Hooks {
    pub fn new() -> Self {
        Hooks(Box::new(()))
    }

    pub fn insert<F: Hook<T> + 'static, T: Send + Sync + 'static>(&mut self, hook: F) {
        let inner = Stack {
            left: hook,
            right: mem::replace(&mut self.0, Box::new(())),
            _marker: PhantomData::default(),
        };

        self.0 = Box::new(inner);
    }

    pub fn call(
        &self,
        frame: &Frame,
        serializer: &mut dyn Serializer,
    ) -> Option<erased_serde::Result<()>> {
        self.0.call(frame, serializer)
    }
}

#[cfg(test)]
mod tests {
    use core::fmt::{Display, Formatter};

    use erased_serde::Serializer;
    use futures::TryFutureExt;

    use crate::{report, ser::Hooks, Context};

    fn serialize_a(a: &u32, s: &mut dyn Serializer) -> erased_serde::Result<()> {
        s.erased_serialize_u32(*a).map(|_| ())
    }

    #[derive(Debug)]
    struct IoError;

    impl Display for IoError {
        fn fmt(&self, f: &mut Formatter<'_>) -> core::fmt::Result {
            f.write_str("Io Error")
        }
    }

    impl Context for IoError {}

    #[test]
    fn no() {
        let frames = report!(IoError).attach(2u32);

        let frame = &frames.current_frames()[0];

        let mut hooks = Hooks::new();
        hooks.insert(serialize_a);

        let mut buf = vec![];

        let mut s = serde_json::Serializer::new(&mut buf);
        let mut s = <dyn Serializer>::erase(&mut s);

        let result = hooks.call(frame, &mut s);
        assert!(result.is_some());
        println!("{}", std::str::from_utf8(&buf).unwrap())
    }
}
