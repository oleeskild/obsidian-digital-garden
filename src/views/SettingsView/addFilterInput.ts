import { Setting, TextComponent } from "obsidian";
import SettingView from "./SettingView";

/** Why a pattern and its flags don't form a valid regular expression. */
export function regexError(pattern: string, flags: string): string | null {
	if (!pattern) return null;

	try {
		new RegExp(pattern, flags);

		return null;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

function addFilterInput(
	filter: { pattern: string; flags: string; replace: string },
	el: HTMLElement,
	idx: number,
	view: SettingView,
	rerender: () => void,
) {
	const row = new Setting(el).setClass("dg-filter-row");
	row.setName(`Filter ${idx + 1}`);

	const showValidity = () => {
		const error = regexError(filter.pattern, filter.flags);
		row.setDesc(error ? `Not a valid regular expression: ${error}` : "");
		row.settingEl.toggleClass("dg-filter-invalid", !!error);
	};

	const field = (
		placeholder: string,
		label: string,
		value: string,
		apply: (value: string) => void,
		cls: string,
	) =>
		row.addText((text: TextComponent) => {
			text.inputEl.addClass(cls);

			text.inputEl.setAttribute(
				"aria-label",
				`${label}, filter ${idx + 1}`,
			);

			text.setPlaceholder(placeholder)
				.setValue(value)
				.onChange(async (next) => {
					// Empty is a real value: it removes the match, or clears
					// the pattern.
					apply(next);
					showValidity();
					await view.saveSettings();
				});
		});

	field(
		"Pattern",
		"Pattern",
		filter.pattern,
		(v) => (view.settings.customFilters[idx].pattern = v),
		"dg-filter-pattern",
	);

	field(
		"Replace with",
		"Replace with",
		filter.replace,
		(v) => (view.settings.customFilters[idx].replace = v),
		"dg-filter-replace",
	);

	field(
		"Flags",
		"Flags",
		filter.flags,
		(v) => (view.settings.customFilters[idx].flags = v),
		"dg-filter-flags",
	);

	row.addExtraButton((button) =>
		button
			.setIcon("trash-2")
			.setTooltip(`Remove filter ${idx + 1}`)
			.onClick(async () => {
				view.settings.customFilters.splice(idx, 1);
				await view.saveSettings();
				rerender();
			}),
	);

	showValidity();
}

export { addFilterInput };
