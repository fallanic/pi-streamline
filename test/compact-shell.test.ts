import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { installCompactShell } from "../extensions/streamline/compact-shell.ts";

initTheme();

const CWD = process.cwd();
const fakeUi = { requestRender() {} };
const definition = {
	renderCall: (args: { file?: string }) => new Text(`read ${args.file}`, 0, 0),
	renderResult: () => new Text("42 lines", 0, 0),
};

/** One finished tool call, rendered the way the transcript renders it. */
function renderRows(): string[] {
	const component = new ToolExecutionComponent(
		"read",
		"call-1",
		{ file: "src/a.ts" },
		{},
		definition,
		fakeUi,
		CWD,
	);
	component.markExecutionStarted();
	component.setArgsComplete();
	component.updateResult({ content: [{ type: "text", text: "42 lines" }], isError: false }, false);
	return component.render(40);
}

const stockRows = renderRows().join("\n");
const hasBackground = (text: string) => /\u001b\[4[89];/.test(text);

/** Captured before any test touches the prototype, so restores land on the real method. */
const pristineShell = ToolExecutionComponent.prototype.getRenderShell;

describe("compact tool shell", () => {
	/** Installs for the duration of one test, then restores. */
	function install(t: { after: (fn: () => void) => void }, target?: object) {
		const uninstall = installCompactShell(target);
		if (uninstall) t.after(uninstall);
		return uninstall;
	}

	it("Pi's default shell paints a full-width background band", () => {
		assert.ok(hasBackground(stockRows), "expected the stock renderer to emit a background colour");
		assert.ok(stockRows.includes(" read src/a.ts"), "expected the stock shell to indent by one cell");
	});

	it("removes the background band and the indent", (t) => {
		install(t);
		const compact = renderRows().join("\n");
		assert.equal(hasBackground(compact), false);
		assert.ok(compact.includes("read src/a.ts"), "tool output must still render");
		assert.ok(compact.includes("42 lines"), "tool result must still render");
	});

	it("restores the stock shell on uninstall", () => {
		const uninstall = installCompactShell();
		assert.ok(uninstall);
		uninstall();
		assert.equal(hasBackground(renderRows().join("\n")), true);
	});

	it("leaves a later patch alone instead of clobbering it", () => {
		const proto = ToolExecutionComponent.prototype;
		const uninstall = installCompactShell();
		assert.ok(uninstall);
		const foreign = () => "default";
		Object.defineProperty(proto, "getRenderShell", { value: foreign, configurable: true });
		uninstall();
		assert.equal(proto.getRenderShell, foreign, "must not restore over a foreign patch");
		Object.defineProperty(proto, "getRenderShell", {
			value: pristineShell,
			configurable: true,
		});
	});

	it("no-ops when the seam is gone", () => {
		// `undefined` means "use the real prototype"; a target without the method is the miss.
		assert.equal(installCompactShell({}), undefined);
	});
});
