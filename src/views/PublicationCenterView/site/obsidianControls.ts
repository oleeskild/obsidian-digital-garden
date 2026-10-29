import { ToggleComponent, type App } from "obsidian";
import {
	ImageFileSuggest,
	SvgFileSuggest,
} from "../../../ui/suggest/file-suggest";

interface ToggleParams {
	value: boolean;
	label: string;
	onChange: (value: boolean) => void;
	disabled?: boolean;
}

/** Obsidian's own toggle, so it looks and behaves like every other one. */
export function toggle(el: HTMLElement, params: ToggleParams) {
	let current = params;
	// setValue fires the change callback; programmatic updates must not.
	let silent = true;
	const component = new ToggleComponent(el);

	component.onChange((value) => {
		if (!silent) current.onChange(value);
	});
	component.setValue(params.value);

	const input = component.toggleEl.querySelector("input");
	input?.setAttribute("aria-label", params.label);
	component.setDisabled(!!params.disabled);
	silent = false;

	return {
		update(next: ToggleParams) {
			current = next;
			input?.setAttribute("aria-label", next.label);
			component.setDisabled(!!next.disabled);

			if (component.getValue() !== next.value) {
				silent = true;
				component.setValue(next.value);
				silent = false;
			}
		},
	};
}

/** Vault file suggestions for an image or SVG path input. */
export function fileSuggest(
	el: HTMLInputElement,
	params: { app: App; kind: "image" | "svg" },
) {
	if (params.kind === "image") new ImageFileSuggest(params.app, el);
	else new SvgFileSuggest(params.app, el);
}
