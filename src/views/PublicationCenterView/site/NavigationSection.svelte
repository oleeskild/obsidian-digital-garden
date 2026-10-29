<!-- src/views/PublicationCenterView/site/NavigationSection.svelte -->
<script lang="ts">
	import NavigationOrderView from "../../NavigationOrder/NavigationOrderView.svelte";
	import Publisher from "../../../publisher/Publisher";
	import SiteRow from "./SiteRow.svelte";
	import { getSiteContext } from "./siteContext";

	const { app, settings, edit } = getSiteContext();

	const publisher = new Publisher(app.vault, app.metadataCache, settings);

	async function setOrder(order: Record<string, string[]> | undefined) {
		settings.navigationOrder = order;
		await edit();
	}
</script>

<SiteRow
	id="navigation"
	name="Navigation order"
	description="Drag folders and notes into the order your site's navigation should show them."
	stacked
>
	<NavigationOrderView {publisher} {settings} onChange={setOrder} />
</SiteRow>
