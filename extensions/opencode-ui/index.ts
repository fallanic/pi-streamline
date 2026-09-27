import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { installCompactRows } from "./compact-rows.ts";
import { installCompactShell } from "./compact-shell.ts";
import { StatusLine } from "./status-line.ts";

/** `setWorkingMessage(undefined)` restores Pi's default, so one call covers both states. */
function show(ctx: ExtensionContext | undefined, text: string | undefined): void {
	if (!ctx || ctx.mode !== "tui" || !ctx.hasUI) return;
	ctx.ui.setWorkingMessage(text);
}

function interactive(ctx: ExtensionContext): boolean {
	return ctx.mode === "tui" && ctx.hasUI;
}

export default function opencodeUi(pi: ExtensionAPI): void {
	const status = new StatusLine();
	let uninstallShell: (() => void) | undefined;
	let uninstallRows: (() => void) | undefined;

	// The shell decides the container in the ToolExecutionComponent constructor,
	// so the patch has to be in place before the first tool call renders.
	pi.on("session_start", (_event, ctx) => {
		uninstallShell = installCompactShell();
		uninstallRows = installCompactRows(status);
		if ((!uninstallShell || !uninstallRows) && interactive(ctx)) {
			ctx.ui.notify(
				"opencode-ui: Pi no longer exposes the tool renderers, running without compact rows",
				"warning",
			);
		}
	});

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

	pi.on("session_shutdown", (_event, ctx) => {
		reset(_event, ctx);
		uninstallRows?.();
		uninstallShell?.();
		uninstallRows = undefined;
		uninstallShell = undefined;
	});
}
