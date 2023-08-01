// Execute this file with: deno run --allow-net --allow-read --allow-write update.ts
import $RefParser from 'npm:@apidevtools/json-schema-ref-parser';
import convert from 'npm:@openapi-contrib/json-schema-to-openapi-schema';
import is from 'npm:@sindresorhus/is';

function convertRef(value: any) {
    if (is.string(value.$ref)) {
        value.$ref = decodeURIComponent(value.$ref);
    }

    if (is.object(value)) {
        Object.keys(value).forEach(key => {
            convertRef(value[key]);
        });
    }
}

async function resolve(source: string) {
    // let bundle = await $RefParser.bundle(source);

    // bundle urlencodes the $ref, so we need to decode it
    // convertRef(bundle);
    // console.log(JSON.stringify(bundle, null, 2));

    let compliant = await convert(source, {dereference: true, dereferenceOptions: {dereference: {circular: 'ignore'}}});

    return JSON.stringify(compliant, null, 2);
}

async function resolveAndWrite(source: string, target: string) {
    let resolved = await resolve(source);

    const file = await Deno.open(target, { create: true, write: true, truncate: true });
    await Deno.writeAll(file, new TextEncoder().encode(resolved));
    file.close();
}

await resolveAndWrite("https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type", "entity_type.json");
await resolveAndWrite("https://blockprotocol.org/types/modules/graph/0.3/schema/property-type", "property_type.json");
await resolveAndWrite("https://blockprotocol.org/types/modules/graph/0.3/schema/data-type", "data_type.json");
