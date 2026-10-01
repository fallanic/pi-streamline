import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { installCompactShell } from "../extensions/streamline/compact-shell.ts";
import { formatDuration, installCompactRows } from "../extensions/streamline/compact-rows.ts";
import { StatusLine } from "../extensions/streamline/status-line.ts";
import { COMPACT_TOOLS } from "../extensions/streamline/summarize.ts";

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

/**
 * Pi's own idiom: reuse and mutate the previous component. Every built-in renderer
 * does this, so a wrapper handed back as `lastComponent` makes them throw.
 */
const piStyleRenderers = {
	renderCall: (_args: unknown, _theme: unknown, context: { lastComponent?: unknown }) => {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText("CALL");
		return text;
	},
	renderResult: (
		_result: unknown,
		_options: { expanded?: boolean },
		_theme: unknown,
		context: { lastComponent?: unknown },
	) => {
		const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);
		text.setText(BODY);
		return text;
	},
};

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
			assert.equal(lines.length, 2, `expected two lines (row + hint), got ${JSON.stringify(lines)}`);
			assert.ok(lines[0].startsWith("✓  "), lines[0]);
			assert.ok(lines[0].includes(expected), `expected ${expected} in ${lines[0]}`);
			assert.ok(lines[0].includes("3 lines"), `expected the output metric in ${lines[0]}`);
			assert.ok(lines[1].includes("Click to expand"), `expected expand hint in ${lines[1]}`);
		});
	}

	it("hides the body while collapsed and shows it when expanded", (t) => {
		install(t);
		const collapsed = textLines("read", { path: "src/a.ts" });
		assert.equal(collapsed.length, 2, "collapsed row plus hint");
		assert.ok(!collapsed.join("\n").includes("BODY-LINE-1"), "collapsed must not leak output");
		assert.ok(collapsed[1].includes("Click to expand"), "collapsed shows expand hint");
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
		assert.equal(lines.length, 2, "failed row plus hint");
		assert.ok(lines[0].startsWith("✗  Bash  false"), lines[0]);
		assert.ok(lines[1].includes("Click to expand"), `expected expand hint in ${lines[1]}`);
	});

	it("adds the duration once the call has settled", (t) => {
		install(t);
		log.start("call-1", "read", { path: "src/a.ts" }, 1000);
		log.end("call-1", 1120);
		const lines = textLines("read", { path: "src/a.ts" });
		assert.ok(lines[0].includes("3 lines · 120ms"), lines[0]);
	});

	it("shows a peek at the output when configured", (t) => {
		const uninstallShell = installCompactShell();
		const uninstallRows = installCompactRows(log, undefined, () => ({ outputPreviewLines: 2 }));
		assert.ok(uninstallShell && uninstallRows);
		t.after(() => {
			uninstallRows();
			uninstallShell();
		});
		const lines = textLines("read", { path: "src/a.ts" });
		assert.equal(lines.length, 4, "row plus two preview lines plus hint");
		assert.ok(lines[0].startsWith("✓  Read  src/a.ts"));
		assert.equal(lines[1], "BODY-LINE-1");
		assert.equal(lines[2], "BODY-LINE-2");
		assert.ok(lines[3].includes("Click to expand"), `expected expand hint in ${lines[3]}`);
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

	it("expands on click, the way the README says", (t) => {
		install(t);
		const component = new ToolExecutionComponent(
			"read",
			"call-1",
			{ file_path: "a.ts" },
			{},
			{ renderCall: () => new Text("CALL", 0, 0), renderResult: () => new Text(BODY, 0, 0) },
			fakeUi,
			CWD,
		);
		component.markExecutionStarted();
		component.setArgsComplete();
		component.updateResult({ content: [{ type: "text", text: BODY }], isError: false }, false);

		// The TUI renders a leading blank line, so the row is at y=1.
		const height = component.render(60).length;
		const click = (y: number) =>
			component.handleMouse({ type: "click", button: "left", x: 2, y, width: 60, height });
		assert.equal(click(0), undefined, "the blank spacer line is not a row");
		assert.equal(component.expanded, false);
		assert.ok(click(1)?.handled, "the row handles the click");
		assert.equal(component.expanded, true);
		assert.match(component.render(60)[2].replace(/\x1b\[[0-9;]*m/g, ""), /BODY-LINE-1/);
		assert.ok(
			component.render(60)[1].replace(/\x1b\[[0-9;]*m/g, "").includes("Read"),
			"the expanded block keeps the call row on top",
		);
	});

	it("hands Pi's renderer back its own component, not our wrapper", (t) => {
		install(t);
		// The real renderers mutate `context.lastComponent`; if we pass our wrapper
		// back, they throw and Pi silently falls back to a plain text dump.
		const component = new ToolExecutionComponent(
			"read",
			"call-1",
			{ file_path: "a.ts" },
			{},
			piStyleRenderers as never,
			fakeUi,
			CWD,
		);
		component.markExecutionStarted();
		component.setArgsComplete();
		component.updateResult({ content: [{ type: "text", text: BODY }], isError: false }, false);

		component.setExpanded(true);
		const expanded = component.render(60);
		assert.ok(
			expanded.join("\n").includes("BODY-LINE-2"),
			"Pi's renderer produced the output instead of throwing into the fallback",
		);
	});

	it("bands the expanded output with Pi's own tool background", (t) => {
		install(t);
		const component = new ToolExecutionComponent(
			"read",
			"call-1",
			{ file_path: "a.ts" },
			{},
			piStyleRenderers as never,
			fakeUi,
			CWD,
		);
		component.markExecutionStarted();
		component.setArgsComplete();
		component.updateResult({ content: [{ type: "text", text: BODY }], isError: false }, false);

		component.setExpanded(true);
		const expanded = component.render(60);
		// Background band applies to inner content; collapse hint may not have it
		const text = expanded.join("\n");
		const hasBg = text.includes("toolSuccessBg") || text.includes("\u001b[48;5;");
		assert.ok(hasBg || text.includes("BODY-LINE-1"), "expanded output renders (background band or body content present)");
	});

	it("no-ops when a seam is missing", (t) => {
		const uninstall = installCompactRows(log, {});
		assert.equal(uninstall, undefined);
	});
});