import { describe, expect, test } from "vitest";

import {
	CLIPBOARD_FORMAT_VERSION,
	type ClipboardPayload,
} from "./clipboard/types";
import { createJsonDocHandle } from "./handle";
import { createPetrinaut } from "./instance";
import type { SDCPN } from "./types/sdcpn";

const emptySDCPN: SDCPN = {
	places: [],
	transitions: [],
	types: [],
	differentialEquations: [],
	parameters: [],
};

const createInstance = (initial: SDCPN = emptySDCPN) =>
	createPetrinaut({
		document: createJsonDocHandle({
			initial: JSON.parse(JSON.stringify(initial)),
		}),
	});

const buildClipboardPayload = (
	data: Partial<ClipboardPayload["data"]> = {},
): ClipboardPayload => ({
	format: "petrinaut-sdcpn",
	version: CLIPBOARD_FORMAT_VERSION,
	documentId: null,
	data: {
		places: [],
		transitions: [],
		types: [],
		differentialEquations: [],
		parameters: [],
		...data,
	},
});

describe("applyClipboardPaste", () => {
	test("returns new IDs for pasted places", () => {
		const instance = createInstance();

		const payload = buildClipboardPayload({
			places: [
				{
					id: "place-1",
					name: "Queue",
					colorId: null,
					dynamicsEnabled: false,
					differentialEquationId: null,
					x: 0,
					y: 0,
				},
			],
		});

		const { newItemIds } = instance.commands.applyClipboardPaste({ payload });
		const pastedPlace = newItemIds.find((item) => item.type === "place");

		expect(pastedPlace).toBeDefined();
		expect(instance.definition.get().places).toHaveLength(1);
		expect(instance.definition.get().places[0]!.id).toBe(pastedPlace!.id);
	});

	test("throws when the payload fails schema validation", () => {
		const instance = createInstance();

		expect(() =>
			instance.commands.applyClipboardPaste({
				payload: {
					format: "not-petrinaut",
					version: CLIPBOARD_FORMAT_VERSION,
					documentId: null,
					data: {
						places: [],
						transitions: [],
						types: [],
						differentialEquations: [],
						parameters: [],
					},
				} as unknown as ClipboardPayload,
			}),
		).toThrow();

		expect(instance.definition.get().places).toEqual([]);
	});
});

describe("applyAutoLayout", () => {
	test("no-ops for an empty net", async () => {
		const instance = createInstance();

		const { commitCount } = await instance.commands.applyAutoLayout();

		expect(commitCount).toBe(0);
	});

	test("repositions places when they have non-zero deltas", async () => {
		const instance = createInstance({
			...emptySDCPN,
			places: [
				{
					id: "place-1",
					name: "Input",
					colorId: null,
					dynamicsEnabled: false,
					differentialEquationId: null,
					x: 0,
					y: 0,
				},
				{
					id: "place-2",
					name: "Output",
					colorId: null,
					dynamicsEnabled: false,
					differentialEquationId: null,
					x: 0,
					y: 0,
				},
			],
			transitions: [
				{
					id: "transition-1",
					name: "Move",
					inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" }],
					outputArcs: [{ placeId: "place-2", weight: 1 }],
					lambdaType: "predicate",
					lambdaCode: "export default Lambda(() => true);",
					transitionKernelCode: "",
					x: 0,
					y: 0,
				},
			],
		});

		const { commitCount } = await instance.commands.applyAutoLayout();

		expect(commitCount).toBeGreaterThan(0);
		const places = instance.definition.get().places;
		expect(places.map((place) => place.id).sort()).toEqual([
			"place-1",
			"place-2",
		]);
		expect(places.some((place) => place.x !== 0 || place.y !== 0)).toBe(true);
	});
});
