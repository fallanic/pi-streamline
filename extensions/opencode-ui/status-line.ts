import { summarize, toolLabel } from "./summarize.ts";

export type ToolCall = {
	toolName: string;
	args: unknown;
	startedAt: number;
};

/** Enough for a long session; older rows lose their metric rather than memory. */
export const MAX_TRACKED_DURATIONS = 256;

/**
 * Tracks in-flight tool calls and renders the single live status line.
 *
 * No elapsed time on purpose: a line that changes on every tick re-renders the
 * whole TUI for no information the transcript row does not already carry.
 */
export class StatusLine {
	readonly #calls = new Map<string, ToolCall>();
	/** Settled durations, so a transcript row can show a metric after the run ended. */
	readonly #durations = new Map<string, number>();

	start(toolCallId: string, toolName: string, args: unknown, now = Date.now()): void {
		this.#calls.set(toolCallId, { toolName, args, startedAt: now });
	}

	/** Returns the call duration so the transcript row can show it. */
	end(toolCallId: string, now = Date.now()): number | undefined {
		const call = this.#calls.get(toolCallId);
		if (!call) return undefined;
		this.#calls.delete(toolCallId);
		const duration = Math.max(0, now - call.startedAt);
		this.#durations.set(toolCallId, duration);
		// Transcript rows re-render long after the run, so durations outlive #calls.
		// Bounded so a long session cannot grow this without limit.
		if (this.#durations.size > MAX_TRACKED_DURATIONS) {
			const oldest = this.#durations.keys().next().value;
			if (oldest !== undefined) this.#durations.delete(oldest);
		}
		return duration;
	}

	/** Duration of a settled call, or undefined while it runs or if it was evicted. */
	durationOf(toolCallId: string): number | undefined {
		return this.#durations.get(toolCallId);
	}

	clear(): void {
		this.#calls.clear();
	}

	get size(): number {
		return this.#calls.size;
	}

	/** The current line, or undefined when nothing is running. */
	text(): string | undefined {
		if (this.#calls.size === 0) return undefined;
		// Most recent call leads, like opencode's `tools().findLast(...)`.
		const current = Array.from(this.#calls.values()).at(-1) as ToolCall;
		const detail = summarize(current.toolName, current.args);
		const line = detail ? `${toolLabel(current.toolName)}  ${detail}` : toolLabel(current.toolName);
		return this.#calls.size > 1 ? `${line} +${this.#calls.size - 1} more` : line;
	}
}
