from pydantic_settings import CliApp

from atlas_tools.wikidata.cli import EntityManifestCommand


def test_entity_manifest_uses_one_way_flags() -> None:
    help_text = CliApp.format_help(EntityManifestCommand)

    assert "--no-row-hash" in help_text
    assert "--row-hash" not in help_text
    assert "--quiet" in help_text
    assert "--no-quiet" not in help_text
