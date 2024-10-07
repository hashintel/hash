use enumflags2::{BitFlag, BitFlags};

pub trait BitFlagsOp: Copy + Sized + From<BitFlags<Self::Flag>> + From<Self::Flag> {
    type Flag: BitFlag;

    const EMPTY: Self;

    fn value(&self) -> BitFlags<Self::Flag>;

    #[must_use]
    fn empty() -> Self {
        Self::from(BitFlags::EMPTY)
    }

    #[must_use]
    fn contains(&self, flag: Self::Flag) -> bool {
        self.value().contains(flag)
    }

    #[must_use]
    fn remove(&self, other: impl Into<Self>) -> Self {
        let other = other.into();

        Self::from(self.value() & !other.value())
    }

    #[must_use]
    fn insert(&self, other: impl Into<Self>) -> Self {
        let other = other.into();

        Self::from(self.value() | other.value())
    }

    #[must_use]
    fn toggle(&self, other: impl Into<Self>) -> Self {
        let other = other.into();

        Self::from(self.value() ^ other.value())
    }

    #[must_use]
    fn invert(&self) -> Self {
        Self::from(!self.value())
    }

    #[must_use]
    fn set(&self, flag: Self::Flag, condition: bool) -> Self {
        if condition {
            self.insert(flag)
        } else {
            self.remove(flag)
        }
    }
}

#[cfg(test)]
mod test {
    use enumflags2::BitFlags;

    use super::BitFlagsOp;

    #[enumflags2::bitflags]
    #[derive(Copy, Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
    #[expect(clippy::min_ident_chars, reason = "Simple test code")]
    #[repr(u8)]
    enum ExampleFlag {
        A = 1 << 0,
        B = 1 << 1,
        C = 1 << 2,
    }

    #[derive(Debug, Copy, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
    struct ExampleFlags(BitFlags<ExampleFlag>);

    impl BitFlagsOp for ExampleFlags {
        type Flag = ExampleFlag;

        const EMPTY: Self = Self(BitFlags::EMPTY);

        fn value(&self) -> BitFlags<Self::Flag> {
            self.0
        }
    }

    impl From<BitFlags<ExampleFlag>> for ExampleFlags {
        fn from(flags: BitFlags<ExampleFlag>) -> Self {
            Self(flags)
        }
    }

    impl From<ExampleFlag> for ExampleFlags {
        fn from(flag: ExampleFlag) -> Self {
            Self::from(BitFlags::from(flag))
        }
    }

    #[test]
    fn remove() {
        let flags = ExampleFlags::from(ExampleFlag::A | ExampleFlag::B);

        let flags = flags.remove(ExampleFlag::A);
        assert_eq!(flags.value(), ExampleFlag::B);

        // if we remove the flag again, nothing should change
        let flags = flags.remove(ExampleFlag::A);
        assert_eq!(flags.value(), ExampleFlag::B);

        // removing a flag that isn't set should not change the flags
        let flags = flags.remove(ExampleFlag::C);
        assert_eq!(flags.value(), ExampleFlag::B);
    }

    #[test]
    fn insert() {
        let flags = ExampleFlags::from(ExampleFlag::A);

        let flags = flags.insert(ExampleFlag::B);
        assert_eq!(flags.value(), ExampleFlag::A | ExampleFlag::B);

        // if we insert the flag again, nothing should change
        let flags = flags.insert(ExampleFlag::B);
        assert_eq!(flags.value(), ExampleFlag::A | ExampleFlag::B);
    }

    #[test]
    fn toggle() {
        let flags = ExampleFlags::from(ExampleFlag::A);

        let flags = flags.toggle(ExampleFlag::A);
        assert_eq!(flags.value(), BitFlags::empty());

        // if we toggle the flag again, the flag should be set
        let flags = flags.toggle(ExampleFlag::A);
        assert_eq!(flags.value(), ExampleFlag::A);
    }

    #[test]
    fn invert() {
        let flags = ExampleFlags::from(ExampleFlag::A);

        let flags = flags.invert();
        assert_eq!(flags.value(), ExampleFlag::B | ExampleFlag::C);

        // if we invert the flags again, the flags should be reset
        let flags = flags.invert();
        assert_eq!(flags.value(), ExampleFlag::A);
    }

    #[test]
    fn set() {
        let flags = ExampleFlags::from(ExampleFlag::A);

        let flags = flags.set(ExampleFlag::A, false);
        assert_eq!(flags.value(), BitFlags::empty());

        // if we remove the flag again, nothing should change
        let flags = flags.set(ExampleFlag::A, false);
        assert_eq!(flags.value(), BitFlags::empty());

        // if we set the flag again, the flag should be set
        let flags = flags.set(ExampleFlag::A, true);
        assert_eq!(flags.value(), ExampleFlag::A);

        // if we set the flag again, the flag should be set, nothing should change
        let flags = flags.set(ExampleFlag::A, true);
        assert_eq!(flags.value(), ExampleFlag::A);
    }
}
