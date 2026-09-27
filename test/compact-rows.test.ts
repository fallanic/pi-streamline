import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { installCompactShell } from "../extensions/opencode-ui/compact-shell.ts";
import { formatDuration, installCompactRows } from "../extensions/opencode-ui/compact-rows.ts";
import { StatusLine } from "../extensions/opencode-ui/status-line.ts";
import { COMPACT_TOOLS } from "../extensions/opencode-ui/summarize.ts";

initTheme();

const CWD = process.cwd();
const fakeUi = { requestRender() {} };
const BODY = "BODY-LINE-1\nBODY-LINE-2\nBODY-LINE-3";

const log = new StatusLine();

/** Installs what the extension installs: the shell, then the renderers. */
function install(t: { after: (fn: () => void) => void }) {
	const uninstallShell = installCompactShell();
	const uninstallRows = installCompactRows(log);
	assert.ok(uninstallShell && uninstallRows, "both seams must exist");
	t.after(() => {
		uninstallRows?.();
		uninstallShell?.();
	});
}

/** Renders a finished tool call the way the transcript renders it. */
function render(toolName: string, args: unknown, options: { expanded?: boolean } = {}) {
	const component = new ToolExecutionComponent(
		toolName,
		"call-1",
		args,
		{},
		{ renderCall: () => new Text("CALL", 0, 0), renderResult: () => new Text(BODY, 0, 0) },
		fakeUi,
		CWD,
	);
	component.markExecutionStarted();
	component.setArgsComplete();
	component.setExpanded(options.expanded === true);
	component.updateResult({ content: [{ type: "text", text: BODY }], isError: false }, false);
	component.setExpanded(options.expanded === true);
	return component.render(60);
}

/** Non-blank rendered lines, ANSI stripped. */
function textLines(toolName: string, args: unknown, options?: Parameters<typeof render>[2]): string[] {
	return render(toolName, args, options)
		.map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trim())
		.filter(Boolean);
}

describe("compact tool rows", () => {
	it("covers exactly the built-in tools", () => {
		assert.deepEqual(
			[...COMPACT_TOOLS].sort(),
			["bash", "edit", "find", "grep", "ls", "powershell", "read", "write"],
		);
	});

	for (const [toolName, args, expected] of [
		["read", { path: "src/a.ts", limit: 10 }, "src/a.ts"],
		["write", { path: "src/b.ts", content: "x" }, "src/b.ts"],
		["edit", { path: "src/c.ts", edits: [] }, "src/c.ts"],
		["bash", { command: "ls -la", timeout: 5 }, "ls -la"],
		["powershell", { command: "Get-ChildItem" }, "Get-ChildItem"],
		["grep", { pattern: "TODO", path: "src" }, "TODO"],
		["find", { pattern: "**/*.ts" }, "**/*.ts"],
		["ls", { path: "packages" }, "packages"],
	] as const) {
		it(`renders one line for ${toolName}`, (t) => {
			install(t);
			const lines = textLines(toolName, args);
			assert.equal(lines.length, 1, `expected one line, got ${JSON.stringify(lines)}`);
			assert.ok(lines[0].startsWith("✓  "), lines[0]);
			assert.ok(lines[0].includes(expected), `expected ${expected} in ${lines[0]}`);
			assert.ok(lines[0].includes("3 lines"), `expected the output metric in ${lines[0]}`);
		});
	}

	it("hides the body while collapsed and shows it when expanded", (t) => {
		install(t);
		const collapsed = textLines("read", { path: "src/a.ts" });
		assert.equal(collapsed.length, 1);
		assert.ok(!collapsed.join("\n").includes("BODY-LINE-1"), "collapsed must not leak output");
		const expanded = textLines("read", { path: "src/a.ts" }, { expanded: true });
		assert.ok(expanded.join("\n").includes("BODY-LINE-1"), "expanded must show Pi's own output");
		assert.ok(expanded.join("\n").includes("BODY-LINE-3"));
	});

	it("shows a running line until the result lands", (t) => {
		install(t);
		const component = new ToolExecutionComponent(
			"bash",
			"call-2",
			{ command: "npm test" },
			{},
			{ renderCall: () => new Text("CALL", 0, 0), renderResult: () => new Text(BODY, 0, 0) },
			fakeUi,
			CWD,
		);
		component.markExecutionStarted();
		component.setArgsComplete();
		const running = component
			.render(60)
			.map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trim())
			.filter(Boolean);
		assert.equal(running.length, 1);
		assert.ok(running[0].startsWith("◐  Bash  npm test"), running[0]);
	});

	it("marks a failed call", (t) => {
		install(t);
		const component = new ToolExecutionComponent(
			"bash",
			"call-3",
			{ command: "false" },
			{},
			{ renderCall: () => new Text("CALL", 0, 0), renderResult: () => new Text(BODY, 0, 0) },
			fakeUi,
			CWD,
		);
		component.markExecutionStarted();
		component.setArgsComplete();
		component.updateResult({ content: [{ type: "text", text: "boom" }], isError: true }, false);
		const lines = component
			.render(60)
			.map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trim())
			.filter(Boolean);
		assert.equal(lines.length, 1);
		assert.ok(lines[0].startsWith("✗  Bash  false"), lines[0]);
	});

	it("adds the duration once the call has settled", (t) => {
		install(t);
		log.start("call-1", "read", { path: "src/a.ts" }, 1000);
		log.end("call-1", 1120);
		const lines = textLines("read", { path: "src/a.ts" });
		assert.ok(lines[0].includes("3 lines · 120ms"), lines[0]);
	});

	it("leaves tools that own a renderer alone", (t) => {
		install(t);
		const joined = textLines("subagent", { agent: "reviewer" }).join("\n");
		assert.ok(joined.includes("CALL"), "pi keeps its own call renderer");
		assert.ok(joined.includes("BODY-LINE-1"), "pi keeps its own result renderer");
		assert.ok(!/[✓◐✗] {2}\w/.test(joined), "no compact row for a tool outside the table");
		assert.ok(
			textLines("subagent", { agent: "reviewer" }, { expanded: true })
				.join("\n")
				.includes("BODY-LINE-1"),
		);
	});

	it("no-ops when a seam is missing", () => {
		assert.equal(installCompactRows(log, {}), undefined);
		assert.equal(installCompactRows(log, { getCallRenderer: () => undefined }), undefined);
	});
});

describe("formatDuration", () => {
	it("scales the unit", () => {
		assert.equal(formatDuration(0), "0ms");
		assert.equal(formatDuration(999), "999ms");
		assert.equal(formatDuration(1500), "1.5s");
		assert.equal(formatDuration(125_000), "2m 5s");
	});
});
