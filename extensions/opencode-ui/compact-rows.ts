import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import type { Component, Theme } from "@earendil-works/pi-tui";
import { Text } from "@earendil-works/pi-tui";
import { type AnyMethod, patchMethod } from "./patch.ts";
import type { StatusLine } from "./status-line.ts";
import { COMPACT_TOOLS, toolDetail, toolLabel } from "./summarize.ts";

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
};

type RenderContext = { isError?: boolean; toolCallId?: string; isPartial?: boolean };
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

function metrics(result: AgentToolResult, log: StatusLine, context?: RenderContext): string {
	const parts: string[] = [];
	const lines = outputLines(result);
	if (lines > 0) parts.push(`${lines} ${lines === 1 ? "line" : "lines"}`);
	const duration = context?.toolCallId ? log.durationOf(context.toolCallId) : undefined;
	if (duration !== undefined) parts.push(formatDuration(duration));
	return parts.join(" · ");
}

/** `✓ Read  src/parser.ts  42 lines · 120ms` */
function row(
	theme: Theme,
	icon: string,
	iconColor: "accent" | "success" | "error",
	toolName: string,
	detail: string,
	metricsText: string,
): Component {
	const parts = [theme.fg("toolTitle", theme.bold(toolLabel(toolName)))];
	if (detail) parts.push(theme.fg("text", detail));
	if (metricsText) parts.push(theme.fg("muted", metricsText));
	return new Text(`${theme.fg(iconColor, icon)}  ${parts.join("  ")}`, 0, 0);
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
					return row(theme, ICON_RUNNING, "accent", this.toolName, toolDetail(this.toolName, args), "");
				}
				return BLANK;
			};
		},
	);

	const uninstallResult = patchMethod(target, RESULT_RENDERER, (original: AnyMethod) =>
		function (this: ToolExecution): ResultRenderer | undefined {
			const predecessor = original.call(this) as ResultRenderer | undefined;
			if (!COMPACT_TOOLS.has(this.toolName)) return predecessor;
			return (result, options, theme, context) => {
				// Expanded: Pi's own renderer, full output.
				if (options?.expanded) return predecessor?.(result, options, theme, context);
				const isError = context?.isError === true;
				return row(
					theme,
					isError ? ICON_ERROR : ICON_OK,
					isError ? "error" : "success",
					this.toolName,
					toolDetail(this.toolName, this.args),
					metrics(result, log, context),
				);
			};
		},
	);

	if (!uninstallCall || !uninstallResult) {
		uninstallCall?.();
		uninstallResult?.();
		return undefined;
	}
	return () => {
		uninstallResult();
		uninstallCall();
	};
}
