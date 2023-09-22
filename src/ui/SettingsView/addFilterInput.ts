import { ButtonComponent, TextComponent } from "obsidian";
import SettingView from "./SettingView";

function addFilterInput(
	filter: { pattern: string; flags: string; replace: string },
	el: HTMLElement,
	idx: number,
	plugin: SettingView,
) {
	const item = el.createEl("li", {
		attr: {
			style: "list-style-type: none; position: relative; margin: 5px 0; padding-right: 45px",
		},
	});
	const patternField = new TextComponent(el);

	patternField
		.setPlaceholder("regex pattern")
		.setValue(filter.pattern)
		.onChange(async (value) => {
			if (!value) {
				return;
			}
			plugin.settings.customFilters[idx].pattern = value;
			await plugin.saveSettings();
		});
	const patternEl = patternField.inputEl;
	patternEl.style.width = "250px";
	item.appendChild(patternEl);

	const replaceField = new TextComponent(el);

	replaceField
		.setPlaceholder("replacement")
		.setValue(filter.replace)
		.onChange(async (value) => {
			if (!value) {
				return;
			}
			plugin.settings.customFilters[idx].replace = value;
			await plugin.saveSettings();
		});
	const replaceEl = replaceField.inputEl;
	replaceEl.style.width = "250px";
	replaceEl.style.marginLeft = "5px";
	item.appendChild(replaceEl);

	const flagField = new TextComponent(el);

	flagField
		.setPlaceholder("flags")
		.setValue(filter.flags)
		.onChange(async (value) => {
			if (!value) {
				return;
			}
			plugin.settings.customFilters[idx].flags = value;
			await plugin.saveSettings();
		});
	const flagEl = flagField.inputEl;
	flagEl.style.width = "50px";
	flagEl.style.marginLeft = "5px";
	item.appendChild(flagEl);

	const removeButton = new ButtonComponent(el);
	removeButton.setIcon("minus");
	removeButton.setTooltip("Remove filter");

	removeButton.onClick(async () => {
		plugin.settings.customFilters.splice(idx, 1);
		el.empty();

		for (let i = 0; i < plugin.settings.customFilters.length; i++) {
			addFilterInput(plugin.settings.customFilters[i], el, i, plugin);
		}
		await plugin.saveSettings();
	});
	const removeButtonEl = removeButton.buttonEl;
	removeButtonEl.style.marginLeft = "5px";
	removeButtonEl.style.position = "absolute";
	removeButtonEl.style.right = "0";
	item.appendChild(removeButtonEl);
}

export { addFilterInput };
