# HASH Integrations Definition

The checked model of an integration definition: the sources an integration reads, the pipelines that turn their rows into entities and links, and the unit maps that give measured values their data types.

`Definition::from_yaml` parses a definition and reports every problem it finds, each with its path and its line and column. `Definition::new` checks parts built another way.
