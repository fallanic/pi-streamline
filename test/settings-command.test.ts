import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, type Settings } from "../extensions/opencode-ui/config.ts";
import { menuEntries, openSettings } from "../extensions/opencode-ui/settings-command.ts";

/** Answers the menu with a fixed script; `undefined` models a cancelled dialog. */
function scriptedSelect(answers: (string | undefined)[]) {
	const asked: string[][] = [];
	return {
		asked,
		ctx: {
			ui: {
				async select(_title: string, options: string[]) {
					asked.push(options);
					return answers.shift();
				},
			},
		},
	};
}

describe("settings menu", () => {
	it("lists every setting plus Done", () => {
		assert.deepEqual(menuEntries(DEFAULT_SETTINGS), [
			"statusLine: on",
			"compactTools: on",
			"subagentHint: on",
			"outputPreview: hidden",
			"Done",
		]);
	});

	it("toggles a setting and re-renders the menu", async () => {
		const settings: Settings = { ...DEFAULT_SETTINGS };
		const applied: string[] = [];
		const ui = scriptedSelect(["statusLine: on", "Done"]);
		await openSettings(ui.ctx, settings, (changed) => applied.push(changed));
		assert.equal(settings.statusLine, false);
		assert.deepEqual(applied, ["statusLine"]);
		assert.equal(ui.asked.length, 2, "menu reopens after the change, then Done closes it");
		assert.ok(ui.asked[1].includes("statusLine: off"), "second menu shows the new value");
	});

	it("cycles the output preview and reports the change", async () => {
		const settings: Settings = { ...DEFAULT_SETTINGS };
		const applied: string[] = [];
		const ui = scriptedSelect([
			"outputPreview: hidden",
			"outputPreview: 3 lines",
			"outputPreview: 8 lines",
			"Done",
		]);
		await openSettings(ui.ctx, settings, (changed) => applied.push(changed));
		assert.equal(settings.outputPreviewLines, 0);
		assert.deepEqual(applied, ["outputPreviewLines", "outputPreviewLines", "outputPreviewLines"]);
	});

	it("leaves settings alone when cancelled", async () => {
		const settings: Settings = { ...DEFAULT_SETTINGS };
		const applied: string[] = [];
		const ui = scriptedSelect(["compactTools: on", undefined]);
		await openSettings(ui.ctx, settings, (changed) => applied.push(changed));
		assert.equal(settings.compactTools, false, "the first pick still applies");
		assert.deepEqual(applied, ["compactTools"]);
		assert.equal(ui.asked.length, 2);
	});
});
