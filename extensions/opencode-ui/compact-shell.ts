import { ToolExecutionComponent } from "@earendil-works/pi-coding-agent";
import { type AnyMethod, patchMethod } from "./patch.ts";

export const RENDER_SHELL_METHOD = "getRenderShell";

/**
 * Drops the full-width background band Pi puts behind every tool call.
 *
 * `renderShell: "self"` makes `ToolExecutionComponent` render into its own
 * container instead of a padded `Box`, so the `toolPendingBg` / `toolSuccessBg`
 * / `toolErrorBg` rows disappear. Tool output itself is untouched.
 *
 * Returns `undefined` when the method is gone: the caller then runs without
 * compact rows instead of failing.
 */
export function installCompactShell(
	target: object | undefined = ToolExecutionComponent.prototype,
): (() => void) | undefined {
	return patchMethod(target, RENDER_SHELL_METHOD, (_original: AnyMethod) => function () {
		return "self";
	});
}
