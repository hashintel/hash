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

    use crate::{
        flags::BitFlagsOp,
        request::flags::{RequestFlag, RequestFlags},
    };

    #[test]
    fn remove() {
        let flags = RequestFlags::from(
            RequestFlag::BeginOfRequest
                | RequestFlag::ContainsAuthorization
                | RequestFlag::EndOfRequest,
        );

        let flags = flags.remove(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.value(),
            RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest
        );

        // if we remove the flag again, nothing should change
        let flags = flags.remove(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.value(),
            RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest
        );
    }

    #[test]
    fn insert() {
        let flags = RequestFlags::from(RequestFlag::ContainsAuthorization);

        let flags = flags.insert(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.value(),
            RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization
        );

        // if we insert the flag again, nothing should change
        let flags = flags.insert(RequestFlag::BeginOfRequest);

        assert_eq!(
            flags.value(),
            RequestFlag::BeginOfRequest | RequestFlag::ContainsAuthorization
        );
    }

    #[test]
    fn toggle() {
        let flags = RequestFlags::from(RequestFlag::BeginOfRequest);

        let flags = flags.toggle(RequestFlag::BeginOfRequest);

        assert_eq!(flags.value(), BitFlags::empty());

        // if we toggle the flag again, the flag should be set
        let flags = flags.toggle(RequestFlag::BeginOfRequest);

        assert_eq!(flags.value(), RequestFlag::BeginOfRequest);
    }

    #[test]
    fn invert() {
        let flags = RequestFlags::from(RequestFlag::BeginOfRequest);

        let flags = flags.invert();

        assert_eq!(
            flags.value(),
            RequestFlag::ContainsAuthorization | RequestFlag::EndOfRequest
        );

        // if we invert the flags again, the flags should be reset
        let flags = flags.invert();

        assert_eq!(flags.value(), BitFlags::from(RequestFlag::BeginOfRequest));
    }

    #[test]
    fn set() {
        let flags = RequestFlags::from(RequestFlag::BeginOfRequest);

        let flags = flags.set(RequestFlag::BeginOfRequest, false);

        assert_eq!(flags.value(), BitFlags::empty());

        // if we remove the flag again, nothing should change
        let flags = flags.set(RequestFlag::BeginOfRequest, false);

        assert_eq!(flags.value(), BitFlags::empty());

        // if we set the flag again, the flag should be set
        let flags = flags.set(RequestFlag::BeginOfRequest, true);

        assert_eq!(flags.value(), RequestFlag::BeginOfRequest);

        // if we set the flag again, the flag should be set, nothing should change
        let flags = flags.set(RequestFlag::BeginOfRequest, true);

        assert_eq!(flags.value(), RequestFlag::BeginOfRequest);
    }
}
