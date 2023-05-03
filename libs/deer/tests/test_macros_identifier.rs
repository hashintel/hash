use deer::{identifier, Reflection};

identifier! {
    pub enum Ident {
        A = "a" | b"a" | 1
    }
}

#[test]
fn compile() {}
