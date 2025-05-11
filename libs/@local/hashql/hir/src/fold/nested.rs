pub trait NestedFilter {
    const DEEP: bool;
}

pub struct Shallow(());
impl NestedFilter for Shallow {
    const DEEP: bool = false;
}

pub struct Deep(());
impl NestedFilter for Deep {
    const DEEP: bool = true;
}
