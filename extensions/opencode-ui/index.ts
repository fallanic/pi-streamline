import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StatusLine } from "./status-line.ts";

/** `setWorkingMessage(undefined)` restores Pi's default, so one call covers both states. */
function show(ctx: ExtensionContext | undefined, text: string | undefined): void {
	if (!ctx || ctx.mode !== "tui" || !ctx.hasUI) return;
	ctx.ui.setWorkingMessage(text);
}

export default function opencodeUi(pi: ExtensionAPI): void {
	const status = new StatusLine();

	pi.on("tool_execution_start", (event, ctx) => {
		status.start(event.toolCallId, event.toolName, event.args);
		show(ctx, status.text());
	});

	pi.on("tool_execution_end", (event, ctx) => {
		status.end(event.toolCallId);
		show(ctx, status.text());
	});

	// A run can end with calls still in flight (abort, error, session switch).
	const reset = (_event: unknown, ctx: ExtensionContext) => {
		status.clear();
		show(ctx, undefined);
	};
	pi.on("agent_end", reset);
	pi.on("session_shutdown", reset);
}
