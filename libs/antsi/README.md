[license]: https://github.com/hashintel/hash/blob/main/libs/deer/LICENSE.md

# antsi

`antsi` is a no-std mini-crate that provides support for SGR[^1] codes (better known as ANSI escape sequences)

The name is a play on words and encapsulates the three goals of the crate:

- ant: small, productive and extremely useful (🐜)
- ansi: implementation of ANSI escape sequences
- antsy: restless as in fast, with near to no overhead (🏎️💨)

The crate tries to be as correct as possible, with the goal of being not only a crate, but also a comprehensive reference about terminal support and related specifications.

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

## Contributors

`antsi` was created by [Bilal Mahmoud](https://github.com/indietyp). It is being developed in conjunction with [HASH](https://hash.dev/). As an open-source project, we gratefully accept external contributions and have published a [contributing guide](https://github.com/hashintel/hash/blob/main/CONTRIBUTING.md) that outlines the process. If you have questions, please reach out to us on our [Discord server](https://hash.ai/discord). You can also report bugs [directly on the GitHub repo](https://github.com/hashintel/hash/issues/new?assignees=Alfred-Mountfield%2CTimDiekmann%2Cindietyp&labels=A-antsi%2CC-bug&template=bug-report-antsi.yml).

## License

`antsi` is available under a number of different open-source licenses. Please see the [LICENSE] file to review your options.

[^1]: SGR stands for Select Graphic Rendition
