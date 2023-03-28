//! ```cargo
//! [dependencies]
//! serde = {version = "*", features = ["derive"]}
//! toml = {version = "*", features = ["parse"]}
//! ```

#![allow(non_snake_case)]

extern crate serde;
extern crate toml;

use std::{
    collections::{BTreeSet, HashMap},
    env, fs,
    iter::once,
    path::{Path, PathBuf},
};

use serde::Deserialize;

const PREFIX: &'static str = "## START CLIPPY LINTS ##";
const SUFFIX: &'static str = "## END CLIPPY LINTS ##";

enum LintLevel {
    Allow,
    Warn,
    ForceWarn,
    Deny,
    Forbid,
}

struct Lints(HashMap<String, LintLevel>);

impl Lints {
    fn new() -> Self {
        Self(HashMap::new())
    }

    // if defined multiple times this is the priority order
    // * allow
    // * warn
    // * deny
    // * forbid
    fn apply(&mut self, file: LintFile) {
        for lint in file.allow {
            self.0.insert(lint, LintLevel::Allow);
        }

        for lint in file.warn {
            self.0.insert(lint, LintLevel::Warn);
        }

        for lint in file.force_warn {
            self.0.insert(lint, LintLevel::ForceWarn);
        }

        for lint in file.deny {
            self.0.insert(lint, LintLevel::Deny);
        }

        for lint in file.forbid {
            self.0.insert(lint, LintLevel::Forbid);
        }

        for lint in file.default {
            self.0.remove(&lint);
        }
    }

    fn into_file(self) -> LintFile {
        self.0
            .into_iter()
            .fold(LintFile::default(), |mut acc, (lint, level)| {
                match level {
                    LintLevel::Allow => acc.allow.insert(lint),
                    LintLevel::Warn => acc.warn.insert(lint),
                    LintLevel::ForceWarn => acc.force_warn.insert(lint),
                    LintLevel::Deny => acc.deny.insert(lint),
                    LintLevel::Forbid => acc.forbid.insert(lint),
                };

                acc
            })
    }
}

#[derive(Deserialize, Default)]
struct LintFile {
    #[serde(default)]
    allow: BTreeSet<String>,
    #[serde(default)]
    warn: BTreeSet<String>,
    #[serde(default)]
    force_warn: BTreeSet<String>,
    #[serde(default)]
    deny: BTreeSet<String>,
    #[serde(default)]
    forbid: BTreeSet<String>,
    #[serde(default)]
    default: BTreeSet<String>,
}

fn collect_lints(cwd: &Path) -> LintFile {
    let mut active = cwd;
    let mut files = vec![];

    // go up the directory tree and find all files in `.config/lints.toml`
    loop {
        let candidate = active.join(".config/lints.toml");

        if candidate.exists() && candidate.is_file() {
            files.push(candidate);
        }

        // we do this until we reach the root of the git repo (a `.git` folder is present)
        if active.join(".git").exists() && active.join(".git").is_dir() {
            break;
        }

        // ... or we have no parent anymore
        if let Some(parent) = active.parent() {
            active = parent;
        } else {
            break;
        }
    }

    // we now apply them into a single configuration this allows for easy overwrites in child
    // directories
    files.reverse();

    let mut lints = Lints::new();

    for file in files {
        let contents =
            fs::read_to_string(&file).expect(&format!("should be able to read {}", file.display()));

        let file =
            toml::from_str(&contents).expect(&format!("should be valid toml ({})", file.display()));
        lints.apply(file);
    }

    lints.into_file()
}

fn collect_cargo(cwd: &Path) -> LintFile {
    let path = cwd.join(".cargo/config.toml");

    if !path.exists() || !path.is_file() {
        panic!(".cargo/config.toml needs to exist")
    }

    let contents =
        fs::read_to_string(&path).expect(&format!("should be able to read {}", path.display()));

    // brute-force, search for the line:
    // ## START CLIPPY LINTS ##
    // and then:
    // ## END CLIPPY LINTS ##
    // take all values in between

    if !contents.contains(PREFIX) || !contents.contains(SUFFIX) {
        panic!("malformed .cargo/config.toml, please add the required markers")
    }

    let file = contents.lines()
        .map(|value| value.trim())
        .skip_while(|value| *value != PREFIX)
        .take_while(|value| *value != SUFFIX)
        .filter(|value| !value.is_empty())
        .filter(|value| value.starts_with('"'))
        // remove leading `"` and trailing `",`
        .map(|value| &value[1..(value.len() - 2)]).fold(LintFile::default(), |mut acc, line| {
            let (arg, lint) = line.split_at(2);

            match arg {
                "-A" => acc.allow.insert(lint.to_owned()),
                "-W" => acc.warn.insert(lint.to_owned()),
                "--force-warn" => acc.force_warn.insert(lint.to_owned()),
                "-D" => acc.deny.insert(lint.to_owned()),
                "-F" => acc.forbid.insert(lint.to_owned()),
                _ => panic!("unrecognized rust flag {}", arg),
            };

            acc
        });

    file
}

fn generate(cwd: &Path) {
    let path = cwd.join(".cargo/config.toml");

    if !path.exists() || !path.is_file() {
        panic!(".cargo/config.toml needs to exist")
    }

    let lints = collect_lints(cwd);

    // read the `config.toml`
    let contents =
        fs::read_to_string(&path).expect(&format!("should be able to read {}", path.display()));

    if !contents.contains(PREFIX) || !contents.contains(SUFFIX) {
        panic!(
            "malformed .cargo/config.toml, please add the required markers \"{}\" and \"{}\" on a \
             separate line to delimit the region this script is allowed to modify.",
            PREFIX, SUFFIX
        )
    }

    // strip out content between the markers
    let prefix = contents.lines().take_while(|value| value.trim() != PREFIX);
    let suffix = contents.lines().skip_while(|value| value.trim() != SUFFIX);

    let indent = contents
        .lines()
        .find(|value| value.trim() == PREFIX)
        .map(|value| " ".repeat(value.len() - value.trim_start().len()))
        .unwrap_or_else(|| "    ".to_owned());

    let body = lints
        .forbid
        .into_iter()
        .map(|lint| format!(r#"{indent}"-F{lint}","#))
        .chain(
            lints
                .deny
                .into_iter()
                .map(|lint| format!(r#"{indent}"-D{lint}","#)),
        )
        .chain(
            lints
                .force_warn
                .into_iter()
                .map(|lint| format!(r#"{indent}"--force-warn{lint}","#)),
        )
        .chain(
            lints
                .warn
                .into_iter()
                .map(|lint| format!(r#"{indent}"-W{lint}","#)),
        )
        .chain(
            lints
                .allow
                .into_iter()
                .map(|lint| format!(r#"{indent}"-A{lint}","#)),
        );

    let contents: Vec<_> = prefix
        .map(|line| line.to_owned())
        .chain(once(format!("{indent}{PREFIX}")))
        .chain(body)
        .chain(suffix.map(|line| line.to_owned()))
        .collect();
    let mut contents = contents.join("\n");
    contents.push('\n');

    fs::write(&path, contents).expect("unable to write `.cargo/config.toml`");
}

fn print_diff(level: &str, left: &BTreeSet<String>, right: &BTreeSet<String>) {
    let create = left - right;
    let remove = right - left;

    eprintln!("Lint Level {level} Errors:");
    eprintln!("  Extra lints: {:?}", remove);
    eprintln!("  Missing lints: {:?}", create);
    eprintln!("  Run `just lint-toml generate` to automatically update the config.")
}

fn check(cwd: &Path) {
    let lints = collect_lints(cwd);
    let cargo = collect_cargo(cwd);

    let mut fail = false;

    if !(&lints.allow ^ &cargo.allow).is_empty() {
        fail = true;
        print_diff("Allow", &lints.allow, &cargo.allow);
    }

    if !(&lints.warn ^ &cargo.warn).is_empty() {
        fail = true;
        print_diff("Warn", &lints.warn, &cargo.warn);
    }

    if !(&lints.force_warn ^ &cargo.force_warn).is_empty() {
        fail = true;
        print_diff("Force Warn", &lints.force_warn, &cargo.force_warn);
    }

    if !(&lints.deny ^ &cargo.deny).is_empty() {
        fail = true;
        print_diff("Deny", &lints.deny, &cargo.deny);
    }

    if !(&lints.forbid ^ &cargo.forbid).is_empty() {
        fail = true;
        print_diff("Forbid", &lints.forbid, &cargo.forbid);
    }

    if fail {
        std::process::exit(1);
    } else {
        println!("No changes necessary, we're good to go!");
    }
}

fn main() {
    let mut args = env::args();
    let mode = args
        .by_ref()
        .skip(1)
        .next()
        .expect("at least one position argument specifying mode required");

    let cwd = args
        .next()
        .map(PathBuf::from)
        .ok_or_else(env::current_dir)
        .expect("unable to read working directory");

    match mode.as_str() {
        "generate" => generate(&cwd),
        "check" => check(&cwd),
        arg => panic!(
            "unrecognized mode `{}`, available: `generate`, `check`",
            arg
        ),
    };
}
