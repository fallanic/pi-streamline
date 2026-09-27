/**
 * One-line summaries of tool arguments.
 *
 * Generic by design: a per-tool table replaces the heuristics in milestone 3, so
 * this only has to be good enough for the live status line.
 */

/** Status lines re-render on every tool event; keep the summary short. */
export const MAX_SUMMARY_CHARS = 80;

function truncate(value: string, max = MAX_SUMMARY_CHARS): string {
	const points = Array.from(value);
	if (points.length <= max) return value;
	return `${points.slice(0, Math.max(0, max - 1)).join("")}…`;
}

function firstString(args: unknown): string | undefined {
	if (args === null || typeof args !== "object") return undefined;
	for (const value of Object.values(args)) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

/** Path-shaped arguments read better as-is; everything else collapses to one line. */
function compact(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

export function summarize(toolName: string, args: unknown): string {
	const direct = firstString(args);
	if (direct) return truncate(compact(direct));
	if (args === null || args === undefined) return "";
	if (typeof args !== "object") return truncate(compact(String(args)));
	const keys = Object.keys(args as object);
	return keys.length ? truncate(compact(JSON.stringify(args))) : "";
}

/** `read` -> `Read`. Tool names stay recognisable; only the first letter is touched. */
export function toolLabel(toolName: string): string {
	return toolName ? toolName[0].toUpperCase() + toolName.slice(1) : toolName;
}
