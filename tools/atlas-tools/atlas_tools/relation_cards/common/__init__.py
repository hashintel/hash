"""Datasource-neutral relation-card contracts and rendering."""

# v5 is the first card format shared across ontology sources.
# v6 guarantees identifier-free prose: adapters rewrite or drop
# identifier mentions inside label/description text (Wikidata property
# descriptions cross-reference PIDs), so v5 and v6 corpora are not
# hash-comparable.
CARD_FORMAT_VERSION = 6
