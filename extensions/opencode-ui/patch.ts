/**
 * The one patching mechanism this extension uses.
 *
 * Every seam is private Pi API, so the rules are uniform: detect first, restore
 * only what we still own, and never throw when Pi has moved on.
 */

export type AnyMethod = (this: unknown, ...args: unknown[]) => unknown;

type MethodHost = Record<string, unknown>;

/**
 * Replaces `target[name]` with `wrap(original)`.
 *
 * Returns `undefined` when the seam is missing, which is the caller's signal to
 * carry on without the feature. The returned uninstall restores the original
 * descriptor, and does nothing if another patch has since been layered on top.
 */
export function patchMethod(
	target: object | undefined,
	name: string,
	wrap: (original: AnyMethod) => AnyMethod,
): (() => void) | undefined {
	const original = (target as MethodHost | undefined)?.[name];
	if (typeof original !== "function") return undefined;
	const descriptor = Object.getOwnPropertyDescriptor(target, name);
	const replacement = wrap(original as AnyMethod);
	Object.defineProperty(target, name, { ...descriptor, value: replacement });
	return () => {
		if ((target as MethodHost)[name] !== replacement) return;
		if (descriptor) Object.defineProperty(target, name, descriptor);
		else delete (target as MethodHost)[name];
	};
}
