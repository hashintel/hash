# HASH Integrations Definition

The checked model of an integration definition: the sources an integration reads, the pipelines that turn their rows into entities and links, and the unit maps that give measured values their data types.

`Definition::new` checks a definition's parts and reports every issue it finds, each with the path of the part it concerns.

`Definition::from_yaml` parses a definition from YAML 1.2, where unquoted numbers and booleans are refused as text. It reports the first place where the text is not YAML or does not fit the format, or else every issue with its line and column where known. The checks of `Definition::new` run only when the YAML builds into parts without issues.

[`examples/aviation.yaml`](examples/aviation.yaml) is a complete definition.
