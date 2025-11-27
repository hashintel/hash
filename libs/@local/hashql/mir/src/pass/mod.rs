use crate::{body::Body, context::MirContext};

pub mod transform;

const fn simplify_type_name(name: &'static str) -> &'static str {
    // The function is more complicated than it should due to the const constraint, but a const
    // constraint means that the created constant only needs to be created once and can be supplied
    // as a default.
    let bytes = name.as_bytes();

    let mut index = bytes.len();
    while index > 0 && bytes[index - 1] != b':' {
        index -= 1;
    }

    // We now have everything *after* an `:`, but generics may still exist, aka: Foo<Bar>
    let (_, bytes) = bytes.split_at(index);

    index = 0;
    while index < bytes.len() && bytes[index] != b'<' {
        index += 1;
    }

    // We now split at the first `<`, therefore also removing all nested generics
    let (bytes, _) = bytes.split_at(index);

    match core::str::from_utf8(bytes) {
        Ok(name) => name,
        Err(_) => {
            panic!("bytes comes from valid utf-8 and should retain being valid utf8")
        }
    }
}

pub trait Pass<'env, 'heap> {
    fn run(&mut self, context: &mut MirContext<'env, 'heap>, body: &mut Body<'heap>);

    fn name(&self) -> &'static str {
        const { simplify_type_name(core::any::type_name::<Self>()) }
    }
}
