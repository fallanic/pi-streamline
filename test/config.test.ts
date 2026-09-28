import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../extensions/streamline/config.ts";

function tempFile(contents?: string): string {
	const path = join(mkdtempSync(join(tmpdir(), "streamline-")), "streamline.json");
	if (contents !== undefined) writeFileSync(path, contents, "utf8");
	return path;
}

describe("loadSettings", () => {
	it("defaults when the file is missing", () => {
		assert.deepEqual(loadSettings(tempFile()), DEFAULT_SETTINGS);
	});

	it("defaults when the file is not JSON", () => {
		assert.deepEqual(loadSettings(tempFile("{ not json")), DEFAULT_SETTINGS);
		assert.deepEqual(loadSettings(tempFile("[]")), DEFAULT_SETTINGS);
		assert.deepEqual(loadSettings(tempFile("null")), DEFAULT_SETTINGS);
	});

	it("ignores values of the wrong type, per key", () => {
		const settings = loadSettings(
			tempFile(
				JSON.stringify({
					statusLine: "yes",
					compactTools: false,
					subagentHint: 1,
					outputPreviewLines: -3,
				}),
			),
		);
		assert.deepEqual(settings, {
			statusLine: true,
			compactTools: false,
			subagentHint: true,
			outputPreviewLines: 0,
		});
	});

	it("round-trips through save", () => {
		const path = tempFile();
		const settings = { ...DEFAULT_SETTINGS, subagentHint: false, outputPreviewLines: 8 };
		saveSettings(settings, path);
		assert.deepEqual(loadSettings(path), settings);
	});
});
