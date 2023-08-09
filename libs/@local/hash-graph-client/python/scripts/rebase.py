# use AST transformations to rewrite the `models.py`, so that
# A) `models.py` imports `schema.py`
# B) `models.py` `EntityType`, `PropertyType` and `DataType`
#       inherit from `OntologyTypeSchema`

import ast
from pathlib import Path

DIRECTORY = Path(__file__).parent.parent

import_statement = ast.ImportFrom(
    module="graph_client.schema", names=[(ast.alias(name="OntologyTypeSchema"))]
)


def remap(class_def: ast.ClassDef) -> ast.ClassDef:
    """Remap the class base class to `OntologyTypeSchema`."""
    if class_def.name not in ("EntityType", "PropertyType", "DataType"):
        return class_def

    class_def.bases = [ast.Name(id="OntologyTypeSchema", ctx=ast.Load())]
    return class_def


models = DIRECTORY / "graph_client" / "models.py"

contents = models.read_text()
tree = ast.parse(contents)

for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef):
        remap(node)

tree.body.insert(1, import_statement)

contents = ast.unparse(ast.fix_missing_locations(tree))
models.write_text(contents)
