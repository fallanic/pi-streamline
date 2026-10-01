import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initTheme, ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { Container, ScrollView, Text, VStack } from "@earendil-works/pi-tui";
import { TuiAltScreen } from "@earendil-works/pi-tui/dist/tui-alt-screen.js";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { installCompactShell } from "../extensions/streamline/compact-shell.ts";
import { installCompactRows } from "../extensions/streamline/compact-rows.ts";
import { StatusLine } from "../extensions/streamline/status-line.ts";

initTheme();

const WIDTH = 60;
const HEIGHT = 10;
const BODY = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n");

/** A real bottom-anchored transcript with one finished compact row in the middle. */
function transcript(t: { after: (fn: () => void) => void }) {
	const uninstallShell = installCompactShell();
	const uninstallRows = installCompactRows(new StatusLine());
	assert.ok(uninstallShell && uninstallRows, "both seams must exist");
	t.after(() => {
		uninstallRows?.();
		uninstallShell?.();
	});

	const tool = new ToolExecutionComponent(
		"read",
		"call-1",
		{ file_path: "a.ts" },
		{},
		{
			renderCall: () => new Text("CALL", 0, 0),
			renderResult: (_r: unknown, o: { expanded?: boolean }) => new Text(o?.expanded ? BODY : "one", 0, 0),
		} as never,
		{ requestRender() {} } as never,
		process.cwd(),
	);
	tool.markExecutionStarted();
	tool.setArgsComplete();
	tool.updateResult({ content: [{ type: "text", text: BODY }], isError: false } as never, false);

	const chat = new Container();
	for (let i = 0; i < 30; i++) chat.addChild(new Text(`filler ${i}`, 1, 0));
	chat.addChild(tool);
	for (let i = 0; i < 12; i++) chat.addChild(new Text(`after ${i}`, 1, 0));
	const doc = new Container();
	doc.addChild(chat);
	const scroll = new ScrollView(doc, { follow: "end", primary: true });
	const root = new VStack([{ component: scroll, basis: 0, grow: 1, shrink: 1, minSize: 1 }]);

	const tui = new TuiAltScreen(
		{ columns: WIDTH, rows: HEIGHT, write: () => true, on: () => {}, off: () => {}, cleanup: () => {} } as never,
		false,
		undefined,
	);
	tui.setLayoutRoot(root);
	tui.altScreenActive = true;
	tool.ui = tui as never;

	/** Lays out, as Pi does on its next frame. */
	const layout = () => {
		tui.currentLayout = renderLayoutFrame(root, WIDTH, HEIGHT, () => {});
	};
	/** The screen row of the compact row, ANSI stripped. */
	const rowOnScreen = () =>
		tui.currentLayout.lines.findIndex((line: string) =>
			/Read\s+a\.ts/.test(line.replace(/\u001b\[[0-9;]*m/g, "")),
		);
	/** Scrolls until the row sits on `targetY`, then lays out. */
	const scrollRowTo = (targetY: number) => {
		const contentRow = scroll
			.render(WIDTH)
			.findIndex((line: string) => /Read\s+a\.ts/.test(line.replace(/\u001b\[[0-9;]*m/g, "")));
		assert.ok(contentRow >= 0, "the row must exist in the content");
		scroll.scrollTo(contentRow - targetY);
		layout();
	};

	layout();
	return { tool, scroll, tui, layout, rowOnScreen, scrollRowTo };
}

/** A real press and release, the way a terminal delivers a click. */
const click = (tui: TuiAltScreen, y: number) => {
	tui.handleViewportInput(`\u001b[<0;4;${y + 1}M`);
	tui.handleViewportInput(`\u001b[<0;4;${y + 1}m`);
};

describe("expanding a row", () => {
	it("pulls a row near the bottom up to the top of the viewport", (t) => {
		const { tool, scroll, tui, layout, scrollRowTo } = transcript(t);
		scrollRowTo(HEIGHT - 1);
		const before = scroll.currentScrollTop;

		click(tui, HEIGHT - 1);
		// Pi lays the taller content out on the next frame, and that frame is what
		// keeps or discards the scroll position.
		layout();

		assert.equal(tool.expanded, true, "the click expanded the row");
		assert.equal(scroll.currentScrollTop, before + HEIGHT - 2, "the row's first line is the top line");
		assert.equal(
			tui.currentLayout.lines[0]?.replace(/\u001b\[[0-9;]*m/g, "").trim(),
			"",
			"the viewport starts at the blank line above the row",
		);
		assert.ok(
			tui.currentLayout.lines.some((line: string) => line.includes("line 1")),
			"the beginning of the expanded output is on screen",
		);
	});

	it("leaves a row near the top where it is", (t) => {
		const { tool, scroll, tui, scrollRowTo } = transcript(t);
		scrollRowTo(1);
		const before = scroll.currentScrollTop;

		click(tui, 1);

		assert.equal(tool.expanded, true);
		assert.equal(scroll.currentScrollTop, before, "a row already in view does not move the view");
	});

	it("collapses again on a second click", (t) => {
		const { tool, tui, layout, scrollRowTo } = transcript(t);
		scrollRowTo(HEIGHT - 1);
		click(tui, HEIGHT - 1);
		assert.equal(tool.expanded, true);
		layout();
		// Expanded, the band's first line is the compact row, the body follows it.
		assert.ok(tui.currentLayout.lines[1]?.includes("Read"), "the call row stays on top");
		assert.ok(tui.currentLayout.lines[2]?.includes("line 1"), "the body starts after the row");

		click(tui, 1);
		assert.equal(tool.expanded, false);
	});
});
