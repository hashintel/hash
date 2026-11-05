"""Generate React geometry and standalone SVG variants from reviewed brand artwork."""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / "src/integration-icon"
ET.register_namespace("", "http://www.w3.org/2000/svg")
svg_ns = "{http://www.w3.org/2000/svg}"
variants = ["mark-mono", "mark-light", "mark-dark", "app-dark", "app-light", "logo-light", "logo-dark"]


def tag_name(element):
    return element.tag.rsplit("}", 1)[-1]


def color_rgb(value):
    value = {"black": "#000000", "white": "#ffffff"}.get(value.lower(), value)
    if not value.startswith("#"):
        return None
    value = value[1:]
    if len(value) == 3:
        value = "".join(char * 2 for char in value)
    if len(value) != 6:
        return None
    return [int(value[index:index + 2], 16) / 255 for index in (0, 2, 4)]


def themed_artwork(brand, kind, dark, for_logo=False):
    path = source / "artwork" / brand["slug"] / f"{kind}.svg"
    if for_logo and path.with_name("logo-mark.svg").exists():
        path = path.with_name("logo-mark.svg")
    override = path.with_name(f"{path.stem}-{'dark' if dark else 'light'}.svg")
    document = ET.fromstring((override if override.exists() else path).read_text())
    document.attrib.pop("width", None)
    document.attrib.pop("height", None)
    if "viewBox" not in document.attrib:
        raise ValueError(f"Missing viewBox: {path}")
    declarations = {}
    for element in document.iter():
        if tag_name(element) == "style":
            for selector, body in re.findall(r"([^{}]+)\{([^{}]+)\}", element.text or ""):
                for name in selector.split(","):
                    name = name.strip().lstrip(".")
                    declarations[name] = declarations.get(name, "") + ";" + body
    paint_properties = {"fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "mask-type", "stop-color", "stop-opacity"}
    svg_attributes = {
        "gradient-units": "gradientUnits",
        "gradient-transform": "gradientTransform",
        "mask-units": "maskUnits",
        "filter-units": "filterUnits",
        "std-deviation": "stdDeviation",
    }
    for element in document.iter():
        for attribute, svg_attribute in svg_attributes.items():
            if attribute in element.attrib:
                element.set(svg_attribute, element.attrib.pop(attribute))
        style = ";".join(declarations.get(name, "") for name in element.attrib.pop("class", "").split()) + ";" + element.attrib.pop("style", "")
        for declaration in style.split(";"):
            if ":" in declaration:
                key, value = declaration.split(":", 1)
                if key.strip() in paint_properties:
                    element.set(key.strip(), value.strip())
    if kind == "logo" and document.get("fill") is None:
        document.set("fill", "#000000")
    colors = brand.get(f"{kind}{'Dark' if dark else 'Light'}Colors", {})
    # Mask colors describe coverage, not visible brand colors.
    def visit(element, in_mask=False):
        in_mask = in_mask or tag_name(element) in ("mask", "clipPath", "filter")
        for attribute in ("fill", "stroke", "stop-color"):
            value = element.get(attribute)
            if value and not in_mask:
                if value in colors:
                    element.set(attribute, colors[value])
                elif dark and kind == "logo" and not override.exists():
                    rgb = color_rgb(value)
                    if rgb and max(rgb) < .48 and max(rgb) - min(rgb) < .24:
                        element.set(attribute, "#F5F7FA")
        for child in list(element):
            if tag_name(child) in ("title", "desc", "metadata", "namedview", "style") or (child.tag.startswith("{") and not child.tag.startswith(svg_ns)):
                element.remove(child)
            else:
                visit(child, in_mask)
    visit(document)
    if dark and kind == "logo" and document.get("fill") is None:
        document.set("fill", "#F5F7FA")
    if dark and kind == "logo" and brand.get("logoRaster") and not brand.get("logoRasterDarkOriginal") and not override.exists():
        definitions = ET.Element(svg_ns + "defs")
        contrast_filter = ET.SubElement(definitions, svg_ns + "filter", {"id": "logo-contrast", "color-interpolation-filters": "sRGB"})
        transfer = ET.SubElement(contrast_filter, svg_ns + "feComponentTransfer")
        for channel in ("R", "G", "B"):
            ET.SubElement(transfer, svg_ns + "feFunc" + channel, {"type": "linear", "slope": ".5", "intercept": ".5"})
        for element in document.iter():
            if tag_name(element) == "image":
                element.set("filter", "url(#logo-contrast)")
        document.insert(0, definitions)
    if kind == "logo" and brand.get("logoLayout"):
        return compose_logo(themed_artwork(brand, "mark", dark, for_logo=True), document, brand["logoLayout"])
    return document


def compose_logo(mark, wordmark, layout):
    document = ET.Element(svg_ns + "svg", {"fill": "none"})
    x = 0
    for name, artwork, height in (("mark", mark, 100), ("wordmark", wordmark, layout["wordmarkHeight"] * 100)):
        viewbox = [float(value) for value in artwork.get("viewBox").replace(",", " ").split()]
        width = height * viewbox[2] / viewbox[3]
        artwork.attrib.update({"x": str(x), "y": str((100 - height) / 2), "width": str(width), "height": str(height)})
        for element in artwork.iter():
            for key, value in list(element.attrib.items()):
                if key == "id":
                    element.set(key, f"{name}-{value}")
                elif "url(#" in value:
                    element.set(key, value.replace("url(#", f"url(#{name}-"))
                elif key.endswith("href") and value.startswith("#"):
                    element.set(key, f"#{name}-{value[1:]}")
        document.append(artwork)
        x += width + (layout["gap"] * 100 if name == "mark" else 0)
    document.set("viewBox", f"0 0 {x} 100")
    return document


def jsx_attr(name):
    if name == "{http://www.w3.org/XML/1998/namespace}space":
        return "xmlSpace"
    if name.startswith(("data-", "aria-")):
        return name
    if name == "class":
        return "className"
    if name == "{http://www.w3.org/1999/xlink}href":
        return "xlinkHref"
    return re.sub(r"-([a-z])", lambda match: match[1].upper(), name)


def jsx(element):
    attrs = []
    for key, value in element.attrib.items():
        if key.startswith("xmlns") or (key.startswith("{") and not key.startswith(("{http://www.w3.org/1999/xlink}", "{http://www.w3.org/XML/1998/namespace}"))):
            continue
        key = jsx_attr(key)
        if key == "maskType":
            attrs.append(f'style={{{{maskType: {json.dumps(value)}}}}}')
            continue
        if key == "id":
            attrs.append(f'{key}={{`${{id}}-{value}`}}')
        elif "url(#" in value:
            value = value.replace("url(#", "url(#${id}-")
            attrs.append(f'{key}={{`{value}`}}')
        elif key in ("href", "xlinkHref") and value.startswith("#"):
            attrs.append(f'{key}={{`#${{id}}-{value[1:]}`}}')
        elif key == "style":
            styles = {jsx_attr(pair.split(":", 1)[0].strip()): pair.split(":", 1)[1].strip() for pair in value.split(";") if ":" in pair and pair.split(":", 1)[0].strip() in ("fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "mask-type")}
            attrs.append(f'style={{{json.dumps(styles)}}}')
        else:
            attrs.append(f'{key}={json.dumps(value)}')
    children = "".join(jsx(child) for child in element)
    content = (element.text or "").strip()
    if content:
        children = "{" + json.dumps(content) + "}" + children
    name = tag_name(element)
    return f'<{name} {" ".join(attrs)}>{children}</{name}>' if children else f'<{name} {" ".join(attrs)} />'


def mono_defs(filter_id):
    return f'<defs><filter id="{filter_id}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 -.13819 -.46488 -.04693 1 0" result="tones"/><feFlood flood-color="currentColor"/><feComposite in2="tones" operator="in"/></filter></defs>'


def app_tile(dark):
    tile = ET.parse(source / "app-tile" / ("dark.svg" if dark else "light.svg")).getroot()
    tile.tag = svg_ns + "g"
    tile.attrib.clear()
    return tile


def prefix_svg(body, prefix):
    body = re.sub(r'id="([^"]+)"', lambda match: f'id="{prefix}-{match[1]}"', body)
    body = body.replace("url(#", f"url(#{prefix}-")
    return re.sub(r'(href|xlink:href)="#([^"]+)"', lambda match: f'{match[1]}="#{prefix}-{match[2]}"', body)


def variant_svg(brand, variant):
    kind = "logo" if variant.startswith("logo") else "mark"
    dark = variant.endswith("dark")
    app = variant.startswith("app")
    mono = variant == "mark-mono"
    artwork = themed_artwork(brand, kind, dark)
    viewbox = [float(value) for value in artwork.get("viewBox").replace(",", " ").split()]
    if kind == "logo":
        outer_viewbox = f"0 0 {viewbox[2]} {viewbox[3]}"
        artwork.set("x", "0")
        artwork.set("y", "0")
        artwork.set("width", str(viewbox[2]))
        artwork.set("height", str(viewbox[3]))
    else:
        outer_viewbox = "0 0 64 64"
        size = 64 / brand["ratio"] if app else 64
        artwork.set("x", str(0 if app and brand["alignment"] == "start" else (64 - size) / 2))
        artwork.set("y", str((64 - size) / 2))
        artwork.set("width", str(size))
        artwork.set("height", str(size))
    prefix = f'{brand["slug"]}-{variant}'
    body = prefix_svg(ET.tostring(artwork, encoding="unicode"), prefix)
    background = prefix_svg(ET.tostring(app_tile(dark), encoding="unicode"), prefix + "-background") if app else ""
    if app:
        body = f'<defs><clipPath id="{prefix}-tile"><rect x=".5" y=".5" width="63" height="63" rx="10"/></clipPath></defs><g clip-path="url(#{prefix}-tile)">{body}</g>'
    if mono:
        body = mono_defs(prefix + "-mono") + f'<g filter="url(#{prefix}-mono)">{body}</g>'
    color = f' color="{("#CBD5E1" if dark else "#374151")}"' if app else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{outer_viewbox}" fill="none"{color}>{background}{body}</svg>\n'


def generate():
    brands = json.loads((source / "brands.json").read_text())
    imports = []
    registry = []
    files = {}
    files[source / "app-tile.tsx"] = "\n".join(f'export const AppTile{("Dark" if dark else "Light")} = ({{ id }}: {{ id: string }}) => ({jsx(app_tile(dark))});' for dark in (False, True)) + "\n"
    catalog = []
    for brand in brands:
        available = [variant for variant in variants if not variant.startswith("logo") or (source / "artwork" / brand["slug"] / "logo.svg").exists()]
        geometries = []
        for kind in ("mark", "logo"):
            if kind == "logo" and "logo-light" not in available:
                continue
            for dark in (False, True):
                artwork = themed_artwork(brand, kind, dark)
                name = kind + ("Dark" if dark else "Light")
                if kind == "mark":
                    artwork.tag = svg_ns + "g"
                    for attribute in ("viewBox", "version", "preserveAspectRatio"):
                        artwork.attrib.pop(attribute, None)
                markup = jsx(artwork)
                binding = "id" if "${id}" in markup else "id: _id"
                geometries.append(f'export const {name} = ({{ {binding} }}: {{ id: string }}) => ({markup});')
        filename = f'./geometry/{brand["slug"]}'
        imports.append(f'import * as {brand["name"]} from "{filename}";')
        files[source / "geometry" / f'{brand["slug"]}.tsx'] = "\n".join(geometries) + "\n"
        mark_viewbox = themed_artwork(brand, "mark", False).get("viewBox")
        logo_viewbox = themed_artwork(brand, "logo", False).get("viewBox") if "logo-light" in available else None
        registry.append(f'  {brand["name"]}: {{ ...{brand["name"]}, markViewBox: {json.dumps(mark_viewbox)}, logoViewBox: {json.dumps(logo_viewbox)}, ratio: {brand["ratio"]}, alignment: "{brand["alignment"]}" }}')
        catalog.append({key: brand[key] for key in ("name", "slug", "label", "integrationNames", "source") } | {"category": "Integrations", "variants": available, "logoSource": brand.get("logoSource"), "logoNotes": brand.get("logoNotes"), "logoRaster": brand.get("logoRaster", False)})
        for variant in available:
            files[root / "assets/integrations" / brand["slug"] / f"{variant}.svg"] = variant_svg(brand, variant)
    files[source / "geometry.ts"] = "\n".join(imports) + "\n\nexport const integrationGeometry = {\n" + ",\n".join(registry) + "\n} as const;\n"
    files[root / "src/integration-icon-catalog.ts"] = 'export const integrationIconVariants = ' + json.dumps(variants) + ' as const;\n\nexport type IntegrationIconVariant = (typeof integrationIconVariants)[number];\n\nexport const integrationIconCatalog = ' + json.dumps(catalog, indent=2) + ' as const;\n\nexport type IntegrationIconName = (typeof integrationIconCatalog)[number]["name"];\n\nexport const integrationIconNameByIntegration: Readonly<Record<string, IntegrationIconName | undefined>> = Object.fromEntries(integrationIconCatalog.flatMap((icon) => icon.integrationNames.map((name) => [name, icon.name])));\n'
    for path, contents in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents)
    for path in (root / "assets/integrations").glob("*/*.svg"):
        if path not in files:
            path.unlink()
    print(f'Generated {len(brands)} icons and {sum(len(icon["variants"]) for icon in catalog)} SVG variants.')


if __name__ == "__main__":
    generate()
