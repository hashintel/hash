use hashql_compiletest::{Command, Options};

fn main() {
    // This is a bit... hacky, see the note on
    // https://doc.rust-lang.org/cargo/reference/resolver.html#dev-dependency-cycles
    // as to how this works.
    // (essentially we're linking and building the same crate twice, meaning that we can't interact
    // with anything in the crate itself)
    let options = Options {
        filter: Some("package(hashql-ast)".to_owned()),
        command: Command::Run { bless: false },
    };

    options.run();
}
