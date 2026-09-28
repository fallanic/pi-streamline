import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_SUMMARY_CHARS, summarize, toolLabel } from "../extensions/streamline/summarize.ts";

describe("summarize", () => {
	it("uses the first string argument", () => {
		assert.equal(summarize("read", { file: "src/a.ts" }), "src/a.ts");
		assert.equal(summarize("bash", { command: "ls -la" }), "ls -la");
	});

	it("collapses whitespace so the line stays one line", () => {
		assert.equal(summarize("bash", { command: "printf 'a\\n b'" }), "printf 'a\\n b'");
	});

	it("truncates with an ellipsis", () => {
		const summary = summarize("bash", { command: "x".repeat(200) });
		assert.equal(Array.from(summary).length, MAX_SUMMARY_CHARS);
		assert.ok(summary.endsWith("…"));
	});

	it("falls back to compact JSON when no argument is a string", () => {
		assert.equal(summarize("read", { limit: 10, offset: 0 }), '{"limit":10,"offset":0}');
	});

	it("returns nothing for missing arguments", () => {
		assert.equal(summarize("read", undefined), "");
		assert.equal(summarize("read", {}), "");
	});
});

describe("toolLabel", () => {
	it("uppercases only the first letter", () => {
		assert.equal(toolLabel("read"), "Read");
		assert.equal(toolLabel("subagent"), "Subagent");
		assert.equal(toolLabel("session_list"), "Session_list");
		assert.equal(toolLabel(""), "");
	});
});
