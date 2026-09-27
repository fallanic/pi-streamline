import assert from "node:assert/strict";
import { describe, it } from "node:test";
import opencodeUi from "../extensions/opencode-ui/index.ts";

type Handler = (event: unknown, ctx: unknown) => void;

/** Minimal stand-ins: the extension only needs `on`, an interactive ctx, and its ui. */
function harness(mode = "tui", hasUI = true) {
	const handlers = new Map<string, Handler[]>();
	const messages: (string | undefined)[] = [];
	const pi = {
		on(event: string, handler: Handler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
		},
	};
	opencodeUi(pi as never);
	const ctx = { mode, hasUI, ui: { setWorkingMessage: (m?: string) => messages.push(m) } };
	return {
		messages,
		emit(event: string, payload: unknown = {}) {
			for (const handler of handlers.get(event) ?? []) handler(payload, ctx);
		},
	};
}

describe("extension wiring", () => {
	it("shows the running tool and restores the default line", () => {
		const ui = harness();
		ui.emit("tool_execution_start", { toolCallId: "a", toolName: "read", args: { file: "a.ts" } });
		ui.emit("tool_execution_start", { toolCallId: "b", toolName: "bash", args: { command: "ls" } });
		ui.emit("tool_execution_end", { toolCallId: "b" });
		ui.emit("tool_execution_end", { toolCallId: "a" });
		assert.deepEqual(ui.messages, ["Read  a.ts", "Bash  ls +1 more", "Read  a.ts", undefined]);
	});

	it("clears the line when a run ends with calls in flight", () => {
		const ui = harness();
		ui.emit("tool_execution_start", { toolCallId: "a", toolName: "read", args: { file: "a.ts" } });
		ui.emit("agent_end");
		assert.deepEqual(ui.messages, ["Read  a.ts", undefined]);
	});

	it("clears the line on session shutdown", () => {
		const ui = harness();
		ui.emit("tool_execution_start", { toolCallId: "a", toolName: "read", args: { file: "a.ts" } });
		ui.emit("session_shutdown");
		assert.deepEqual(ui.messages, ["Read  a.ts", undefined]);
	});

	it("stays silent outside the interactive TUI", () => {
		for (const [mode, hasUI] of [
			["print", false],
			["json", false],
			["tui", false],
		] as const) {
			const ui = harness(mode, hasUI);
			ui.emit("tool_execution_start", { toolCallId: "a", toolName: "read", args: { file: "a.ts" } });
			assert.deepEqual(ui.messages, [], `mode=${mode} hasUI=${hasUI}`);
		}
	});
});
