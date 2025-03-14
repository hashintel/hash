[license]: https://github.com/hashintel/hash/blob/main/libs/antsi/LICENSE.md
[Apache License, Version 2.0]: https://github.com/hashintel/hash/blob/main/libs/antsi/LICENSE-APACHE.md
[MIT license]: https://github.com/hashintel/hash/blob/main/libs/antsi/LICENSE-MIT.md

# antsi

`antsi` is a no-std mini-crate that provides support for SGR[^1] codes (better known as ANSI escape sequences)

The name is a play on words and encapsulates the three goals of the crate:

- ant: small, productive and extremely useful (🐜)
- ansi: implementation of ANSI escape sequences
- antsy: restless as in fast, with near to no overhead (🏎️💨)

The crate tries to be as correct as possible, acting both as a library and as an up-to-date reference guide regarding terminal support and related specifications (correct as of the time of publication).

## Example

```rust
use antsi::{BasicColor, Style, Font, FontWeight};

// effortless const support
const PANIC_STYLE: Style = Style::new().with_foreground(BasicColor::Red.bright().into());
const BOLD_STYLE: Style = Style::new().with_font(Font::new().with_weight(FontWeight::Bold));

fn knows_user() -> bool {
    true
}

fn main() {
    // dynamic style support
    let mut style = Style::new();
    if knows_user() {
        style = style.font_mut().set_strikethrough();
    }
    eprintln!("O no! {}", PANIC_STYLE.apply(format_args!("mainframe breach {} has been {}", style.apply("(from an unknown user)"), BOLD_STYLE.apply("detected"))))
}
```

<pre>
O no! <span style="color: red;">mainframe breach <s>(from an unknown user)</s> has been <strong>detected</strong></span>
</pre>

## Contributors

`antsi` was created by [Bilal Mahmoud](https://github.com/indietyp) for use in [`error-stack`](https://github.com/hashintel/hash/tree/main/libs/error-stack). It is being developed in conjunction with [HASH](https://hash.dev/) as an open-source project. We gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/.github/CONTRIBUTING.md) that outlines the process. If you have questions, please create a [discussion](https://github.com/orgs/hashintel/discussions). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new/choose).

## License

`antsi` is available under either of the [Apache License, Version 2.0] or [MIT license] at your option. Please see the [LICENSE] file to review your options.

[^1]: SGR stands for Select Graphic Rendition
