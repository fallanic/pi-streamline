import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { installCompactRows } from "./compact-rows.ts";
import { installCompactShell } from "./compact-shell.ts";
import { type Settings, loadSettings, saveSettings } from "./config.ts";
import { openSettings } from "./settings-command.ts";
import { StatusLine } from "./status-line.ts";

/** `setWorkingMessage(undefined)` restores Pi's default, so one call covers both states. */
function show(ctx: ExtensionContext | undefined, text: string | undefined): void {
	if (!ctx || ctx.mode !== "tui" || !ctx.hasUI) return;
	ctx.ui.setWorkingMessage(text);
}

function interactive(ctx: ExtensionContext): boolean {
	return ctx.mode === "tui" && ctx.hasUI;
}

export default function streamline(pi: ExtensionAPI): void {
	const status = new StatusLine();
	const settings: Settings = loadSettings();
	let uninstall: (() => void) | undefined;

	// The shell decides the container in the ToolExecutionComponent constructor,
	// so a patch has to be in place before the first tool call renders. Toggling it
	// back on mid-session only affects calls started after the toggle.
	const applyPatches = (ctx: ExtensionContext) => {
		if (!settings.compactTools || uninstall) return;
		const uninstallShell = installCompactShell();
		const uninstallRows = installCompactRows(status, undefined, () => settings);
		if (!uninstallShell || !uninstallRows) {
			uninstallShell?.();
			uninstallRows?.();
			if (interactive(ctx)) {
				ctx.ui.notify(
					"streamline: Pi no longer exposes the tool renderers, running without compact rows",
					"warning",
				);
			}
			return;
		}
		uninstall = () => {
			uninstallRows();
			uninstallShell();
		};
	};

	const removePatches = () => {
		uninstall?.();
		uninstall = undefined;
	};

	pi.on("session_start", (_event, ctx) => {
		status.hints = settings.subagentHint;
		applyPatches(ctx);
	});

	pi.on("tool_execution_start", (event, ctx) => {
		status.start(event.toolCallId, event.toolName, event.args);
		if (settings.statusLine) show(ctx, status.text());
	});

	pi.on("tool_execution_end", (event, ctx) => {
		status.end(event.toolCallId);
		if (settings.statusLine) show(ctx, status.text());
	});

	// A run can end with calls still in flight (abort, error, session switch).
	const reset = (_event: unknown, ctx: ExtensionContext) => {
		status.clear();
		show(ctx, undefined);
	};
	pi.on("agent_end", reset);

	pi.on("session_shutdown", (_event, ctx) => {
		reset(_event, ctx);
		removePatches();
	});

	pi.registerCommand("streamline", {
		description: "Configure streamline rendering",
		handler: async (_args, ctx) => {
			await openSettings(ctx, settings, (changed) => {
				if (changed === "statusLine" && !settings.statusLine) show(ctx, undefined);
				if (changed === "subagentHint") status.hints = settings.subagentHint;
				if (changed === "compactTools") {
					if (settings.compactTools) applyPatches(ctx);
					else removePatches();
				}
				try {
					saveSettings(settings);
				} catch (error) {
					ctx.ui.notify(
						`streamline: could not save settings (${error instanceof Error ? error.message : String(error)})`,
						"warning",
					);
				}
			});
		},
	});
}