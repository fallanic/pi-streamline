import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StatusLine } from "../extensions/opencode-ui/status-line.ts";

describe("StatusLine", () => {
	it("is empty until a call starts", () => {
		const status = new StatusLine();
		assert.equal(status.text(), undefined);
		status.start("a", "read", { file: "src/parser.ts" });
		assert.equal(status.text(), "Read  src/parser.ts");
	});

	it("counts parallel calls and leads with the most recent", () => {
		const status = new StatusLine();
		status.start("a", "read", { file: "one.ts" });
		status.start("b", "bash", { command: "ls -la" });
		assert.equal(status.text(), "Bash  ls -la +1 more");
		status.start("c", "grep", { pattern: "TODO" });
		assert.equal(status.text(), "Grep  TODO +2 more");
	});

	it("drops a call on end and restores the previous line", () => {
		const status = new StatusLine();
		status.start("a", "read", { file: "one.ts" });
		status.start("b", "read", { file: "two.ts" });
		const duration = status.end("b", 1000);
		assert.equal(typeof duration, "number");
		assert.equal(status.text(), "Read  one.ts");
		assert.equal(status.size, 1);
	});

	it("ignores an unknown call id", () => {
		const status = new StatusLine();
		assert.equal(status.end("nope"), undefined);
		assert.equal(status.size, 0);
	});

	it("reports duration from start to end", () => {
		const status = new StatusLine();
		status.start("a", "bash", { command: "sleep 1" }, 1000);
		assert.equal(status.end("a", 1250), 250);
	});

	it("clears back to the default line", () => {
		const status = new StatusLine();
		status.start("a", "read", { file: "one.ts" });
		status.clear();
		assert.equal(status.text(), undefined);
	});

	it("shows only the label for a tool with no arguments", () => {
		const status = new StatusLine();
		status.start("a", "session_list", {});
		assert.equal(status.text(), "Session_list");
	});
});
