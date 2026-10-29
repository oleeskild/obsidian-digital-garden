/**
 * Svelte action that keeps a checkbox's partial state in sync. Obsidian
 * draws the dash from `data-indeterminate="true"`, not from the DOM
 * `indeterminate` property alone, so both are set.
 */
export function indeterminate(el: HTMLInputElement, value: boolean) {
	const apply = (v: boolean) => {
		el.indeterminate = v;
		el.dataset.indeterminate = String(v);
	};
	apply(value);

	return { update: apply };
}
