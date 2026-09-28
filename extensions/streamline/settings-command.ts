import { PREVIEW_CHOICES, type Settings } from "./config.ts";

type SelectContext = {
	ui: { select(title: string, options: string[]): Promise<string | undefined> };
};

const on = (value: boolean) => (value ? "on" : "off");

function previewLabel(lines: number): string {
	return lines === 0 ? "hidden" : `${lines} lines`;
}

/** Menu row per setting, in the order the menu shows them. */
export function menuEntries(settings: Settings): string[] {
	return [
		`compactTools: ${on(settings.compactTools)}`,
		`outputPreview: ${previewLabel(settings.outputPreviewLines)}`,
		`statusLine: ${on(settings.statusLine)}`,
		`subagentHint: ${on(settings.subagentHint)}`,
		"Done",
	];
}

const TOGGLES = ["compactTools", "statusLine", "subagentHint"] as const;

/**
 * Toggles settings in place until the user picks Done or cancels.
 *
 * `apply` is called after every change so it takes effect immediately rather
 * than on the next `/reload`.
 */
export async function openSettings(
	ctx: SelectContext,
	settings: Settings,
	apply: (changed: keyof Settings) => void,
): Promise<void> {
	for (;;) {
		const entries = menuEntries(settings);
		const choice = await ctx.ui.select("opencode-ui", entries);
		if (!choice) return; // cancelled
		const picked = entries.indexOf(choice);
		if (picked < 0 || picked === entries.length - 1) return; // unknown or Done

		if (picked === 1) {
			const at = PREVIEW_CHOICES.indexOf(
				settings.outputPreviewLines as (typeof PREVIEW_CHOICES)[number],
			);
			settings.outputPreviewLines = PREVIEW_CHOICES[(at + 1) % PREVIEW_CHOICES.length] ?? 0;
			apply("outputPreviewLines");
			continue;
		}

		const changed = TOGGLES[picked < 1 ? picked : picked - 1];
		if (!changed) return;
		settings[changed] = !settings[changed];
		apply(changed);
	}
}