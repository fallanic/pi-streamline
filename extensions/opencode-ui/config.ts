import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export type Settings = {
	/** Drive Pi's working message with the current tool. */
	statusLine: boolean;
	/** Replace the tool renderers with one-line rows. */
	compactTools: boolean;
	/** Point at /subagents-fleet while a subagent runs. */
	subagentHint: boolean;
	/** Lines of tool output shown inside a collapsed row; 0 hides them. */
	outputPreviewLines: number;
};

export const DEFAULT_SETTINGS: Settings = {
	statusLine: true,
	compactTools: true,
	subagentHint: true,
	outputPreviewLines: 0,
};

export const configPath = join(getAgentDir(), "opencode-ui.json");

/** Cycle order for the preview setting. */
export const PREVIEW_CHOICES = [0, 3, 8] as const;

function boolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function lineCount(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/**
 * Reads the settings file, falling back to defaults for anything missing,
 * unreadable, or the wrong type. A broken config must never break the TUI.
 */
export function loadSettings(path = configPath): Settings {
	let raw: unknown;
	try {
		raw = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
	if (raw === null || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
	const record = raw as Record<string, unknown>;
	return {
		statusLine: boolean(record.statusLine, DEFAULT_SETTINGS.statusLine),
		compactTools: boolean(record.compactTools, DEFAULT_SETTINGS.compactTools),
		subagentHint: boolean(record.subagentHint, DEFAULT_SETTINGS.subagentHint),
		outputPreviewLines: lineCount(
			record.outputPreviewLines,
			DEFAULT_SETTINGS.outputPreviewLines,
		),
	};
}

export function saveSettings(settings: Settings, path = configPath): void {
	writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}
