import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component, Theme } from "@earendil-works/pi-tui";
import { Box, MouseRegion, Text } from "@earendil-works/pi-tui";
import { type AnyMethod, patchMethod } from "./patch.ts";
import type { StatusLine } from "./status-line.ts";
import { COMPACT_TOOLS, toolDetailLines, toolLabel } from "./summarize.ts";

const CALL_RENDERER = "getCallRenderer";
const RESULT_RENDERER = "getResultRenderer";

const ICON_RUNNING = "◐";
const ICON_OK = "✓";
const ICON_ERROR = "✗";

/** Renders no lines at all, so a renderer step can step out of the way. */
const BLANK: Component = {
	render: () => [],
	invalidate() {},
};

/** The private fields of ToolExecutionComponent that the renderers read. */
type ToolExecution = {
	toolName: string;
	args: unknown;
	expanded: boolean;
	setExpanded(expanded: boolean): void;
	ui: {
		getPrimaryScrollView?(): ScrollTarget;
		requestRender?(): void;
	};
};

type MouseEvent = { type: string; button: string; screenY: number };

/** The ScrollView fields the scroll below depends on; the last one is public API. */
type ScrollTarget = {
	currentScrollTop: number;
	currentViewportHeight: number;
	followingEnd: boolean;
	scrollTo?(scrollTop: number, options?: { disableFollow?: boolean }): void;
};

type RenderContext = { isError?: boolean; toolCallId?: string; isPartial?: boolean; lastComponent?: Component };
type ResultOptions = { expanded?: boolean };
type AgentToolResult = { content?: Array<{ type?: string; text?: string }> };

type CallRenderer = (
	args: unknown,
	theme: Theme,
	context: RenderContext,
) => Component | undefined;
type ResultRenderer = (
	result: AgentToolResult,
	options: ResultOptions,
	theme: Theme,
	context: RenderContext,
) => Component | undefined;

export type RowOptions = {
	/** Lines of output shown inside a collapsed row; 0 hides them. */
	outputPreviewLines: number;
};

const NO_PREVIEW: RowOptions = { outputPreviewLines: 0 };

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function outputLines(result: AgentToolResult | undefined): number {
	let lines = 0;
	for (const block of result?.content ?? []) {
		if (block?.type === "text" && typeof block.text === "string") {
			lines += block.text.split("\n").length;
		}
	}
	return lines;
}

function previewLines(result: AgentToolResult | undefined, max: number): string[] {
	if (max <= 0) return [];
	const text = (result?.content ?? [])
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text as string)
		.join("\n");
	return text.split("\n").slice(0, max);
}

function metrics(result: AgentToolResult, log: StatusLine, context?: RenderContext): string {
	const parts: string[] = [];
	const lines = outputLines(result);
	if (lines > 0) parts.push(`${lines} ${lines === 1 ? "line" : "lines"}`);
	const duration = context?.toolCallId ? log.durationOf(context.toolCallId) : undefined;
	if (duration !== undefined) parts.push(formatDuration(duration));
	return parts.join(" · ");
}

/**
 * `✓ Read  src/parser.ts  42 lines · 120ms`, optionally with a peek at the output.
 *
 * `detail` is the tool's identifying argument, already split into its own lines: the
 * first one shares the icon line, the rest follow indented under it, so a long
 * multi-line command is shown whole rather than collapsed into one truncated line.
 */
function row(
	theme: Theme,
	icon: string,
	iconColor: "accent" | "success" | "error",
	toolName: string,
	detail: string[],
	metricsText: string,
	preview: string[] = [],
	hint?: string,
): Component {
	const parts = [theme.fg("toolTitle", theme.bold(toolLabel(toolName)))];
	if (detail[0]) parts.push(theme.fg("text", detail[0]));
	if (metricsText) parts.push(theme.fg("muted", metricsText));
	const lines = [`${theme.fg(iconColor, icon)}  ${parts.join("  ")}`];
	for (const line of detail.slice(1)) lines.push(theme.fg("text", `   ${line}`));
	for (const line of preview) lines.push(theme.fg("dim", `   ${line}`));
	if (hint) lines.push(theme.fg("dim", `   ${hint}`));
	return new Text(lines.join("\n"), 0, 0);
}

/**
 * Click toggles the row, and pulls it up when the expansion would push its output
 * below the fold.
 *
 * The transcript is bottom-anchored, so expanding the last rows hides their
 * beginnings under the top of the viewport. Scrolling the clicked line to the top
 * is what puts the whole block back in view. A click near the top already shows
 * everything, so it is left alone.
 */
function clickable(component: ToolExecution, body: Component): Component {
	return new MouseRegion(body, (event: MouseEvent) => {
		if (event.type !== "click" || event.button !== "left") return undefined;
		component.setExpanded(!component.expanded);
		const ui = component.ui;
		const scroll = ui?.getPrimaryScrollView?.();
		// `screenY` counts rows within the viewport, `currentScrollTop` within the
		// content. The row's own first line is the blank one above the clicked line.
		const offset = event.screenY;
		if (scroll && offset >= scroll.currentViewportHeight / 3) {
			revealRow(scroll, scroll.currentScrollTop + offset - 1);
			ui.requestRender?.();
		}
		return { handled: true };
	});
}

/**
 * Moves the transcript so `target` is its first visible line.
 *
 * Not `scrollTo`: the transcript is bottom-anchored, so the expansion has not been
 * laid out yet and `scrollTo` clamps against the old, shorter content — and the
 * next `updateLayout` re-anchors to the end anyway, discarding the request. Writing
 * the position directly survives it, because `updateLayout` keeps a non-following
 * `currentScrollTop` and only clamps it into the new range.
 *
 * ponytail: writes two private fields. If Pi renames them the numeric check fails
 * and expanding simply stops scrolling; upstream scroll API when one exists.
 */
function revealRow(scroll: ScrollTarget, target: number): void {
	if (typeof scroll.currentScrollTop !== "number" || typeof scroll.followingEnd !== "boolean") {
		return;
	}
	scroll.followingEnd = false;
	scroll.currentScrollTop = Math.max(0, target);
}

/**
 * Keeps the viewport where it is across the frame that expands a row.
 *
 * `updateLayout` re-anchors to the end whenever the view is following it, so a row
 * expanded from the keyboard — where nothing calls `revealRow` — slides its own
 * beginning off the top of the viewport and leaves only the tail of the output on
 * screen. Releasing the anchor first keeps the row on the line it was on and lets
 * the block grow downward, which is what a mouse click already produces.
 *
 * `disableFollow` is what survives the layout, and no scroll position is written:
 * the row stays on the line it was expanded from and the block grows downward.
 * A transcript with nothing to scroll is unaffected — its position is 0 either way.
 * Expanding does stop auto-following until the view is scrolled back to the end,
 * which is what the click path has always done too.
 */
function pinRow(scroll: ScrollTarget | undefined): void {
	if (typeof scroll?.scrollTo !== "function") return;
	scroll.scrollTo(scroll.currentScrollTop, { disableFollow: true });
}

/**
 * Replaces Pi's per-tool renderers with a single line.
 *
 * Only the tools in `COMPACT_TOOLS` are touched. Everything else — `subagent`
 * included — keeps Pi's own renderer, and the expanded state always defers to
 * the renderer we replaced, so no output is ever lost.
 *
 * Returns `undefined` when either seam is missing.
 */
export function installCompactRows(
	log: StatusLine,
	target: object | undefined = ToolExecutionComponent.prototype,
	// Named `rowOptions` on purpose: the result renderer receives its own `options`.
	rowOptions: () => RowOptions = () => NO_PREVIEW,
): (() => void) | undefined {
	// Each seam returns a *renderer*, so the patch builds one: the getter runs with
	// no arguments, the renderer it hands back is what receives theme and context.
	const uninstallCall = patchMethod(target, CALL_RENDERER, (original: AnyMethod) =>
		function (this: ToolExecution): CallRenderer | undefined {
			const predecessor = original.call(this) as CallRenderer | undefined;
			if (!COMPACT_TOOLS.has(this.toolName)) return predecessor;
			return (args, theme, context) => {
				// Once the result has landed, the result renderer draws the settled row,
				// so the call renderer must not draw a second line.
				if (context?.isPartial !== false) {
					return row(
						theme,
						ICON_RUNNING,
						"accent",
						this.toolName,
						toolDetailLines(this.toolName, args),
						"",
					);
				}
				return BLANK;
			};
		},
	);

	const uninstallResult = patchMethod(target, RESULT_RENDERER, (original: AnyMethod) =>
		function (this: ToolExecution): ResultRenderer | undefined {
			const predecessor = original.call(this) as ResultRenderer | undefined;
			if (!COMPACT_TOOLS.has(this.toolName)) return predecessor;
			const component = this;
			// Pi's renderers mutate and reuse `context.lastComponent` (`?? new Text()`
			// then `setText`/`clear`). Pi stores whatever we return, so handing it our
			// wrapper back would make them throw and Pi would silently fall back to a
			// plain text dump. Track their component and pass that instead.
			let inner: Component | undefined;
			return (result, options, theme, context) => {
				// `updateResult(result, /* isPartial */ true)` fires on every streaming
				// `tool_execution_update`, so a result can arrive while the call is still
				// running — with `isPartial` still true. Drawing the settled row then would
				// put `✓` under the `◐` the call renderer draws, i.e. the same call twice.
				// The call row owns every not-yet-settled state.
				if (context?.isPartial !== false) return BLANK;
				const isError = context?.isError === true;
				// Expanded: Pi's own renderer, full output, on the background band Pi
				// paints by default, so an open row is visible as a block.
				if (options?.expanded) {
					// Always override: Pi's stored `lastComponent` is our wrapper.
					const forwarded = { ...context, lastComponent: inner };
					inner = predecessor?.(result, options, theme, forwarded);
					if (!inner) return inner;
					const band = new Box(0, 0, (text) =>
						theme.bg(isError ? "toolErrorBg" : "toolSuccessBg", text),
					);
					// Keep the call itself visible at the top of the expanded block, so a
					// long output can be read without scrolling back up to find out
					// which tool produced it.
					band.addChild(
						row(
							theme,
							isError ? ICON_ERROR : ICON_OK,
							isError ? "error" : "success",
							this.toolName,
							toolDetailLines(this.toolName, this.args),
							metrics(result, log, context),
						),
					);
					band.addChild(inner);
					// Add collapse hint below the expanded content
					const collapseHint = new Text(theme.fg("dim", `   Click to collapse`), 0, 0);
					band.addChild(collapseHint);
					return clickable(component, band);
				}
				// Collapsed rows never reach Pi's renderer, so it has nothing to reuse.
				inner = undefined;
				return clickable(
					component,
					row(
						theme,
						isError ? ICON_ERROR : ICON_OK,
						isError ? "error" : "success",
						this.toolName,
						toolDetailLines(this.toolName, this.args),
						metrics(result, log, context),
						previewLines(result, rowOptions().outputPreviewLines),
						"Click to expand",
					),
				);
			};
		},
	);

	// Pi's own expand key reaches every row through `setExpanded` and never scrolls,
	// so the keyboard path needs the anchor released too — see `pinRow`.
	const uninstallExpand = patchMethod(target, "setExpanded", (original: AnyMethod) =>
		function (this: ToolExecution, expanded: boolean): unknown {
			const result = original.call(this, expanded);
			if (expanded && COMPACT_TOOLS.has(this.toolName)) {
				pinRow(this.ui?.getPrimaryScrollView?.());
			}
			return result;
		},
	);

	if (!uninstallCall || !uninstallResult || !uninstallExpand) {
		uninstallCall?.();
		uninstallResult?.();
		uninstallExpand?.();
		return undefined;
	}
	return () => {
		uninstallExpand();
		uninstallResult();
		uninstallCall();
	};
}