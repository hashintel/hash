use deer::identifier;

identifier! {
    pub enum Ident {
        A = "a" | b"a" | 1
    }
}

#[test]
fn compile() {}
