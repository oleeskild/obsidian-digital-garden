import type DigitalGardenSettings from "src/models/settings";
import { PublishPlatform } from "src/models/PublishPlatform";
import { ForestryApiError } from "src/forestry/ForestryApi";
import {
	ConnectConfirmDetails,
	ConnectWithCodeDeps,
	connectWithCode,
} from "src/forestry/connectWithCode";

const newGarden = {
	apiKey: "new-key",
	pageName: "test-garden",
	baseUrl: "test-garden.forestry.md",
};

function makeSettings(
	overrides: Partial<DigitalGardenSettings> = {},
): DigitalGardenSettings {
	return {
		publishPlatform: PublishPlatform.ForestryMd,
		githubRepo: "",
		githubUserName: "",
		forestrySettings: {
			apiKey: "old-key",
			forestryPageName: "old-garden",
			baseUrl: "old-garden.forestry.md",
		},
		...overrides,
	} as DigitalGardenSettings;
}

function makeDeps(
	settings: DigitalGardenSettings,
	confirmed: boolean,
): ConnectWithCodeDeps & {
	confirm: jest.Mock;
	saveSettings: jest.Mock;
	reportVault: jest.Mock;
	notify: jest.Mock;
	exchange: jest.Mock;
	logError: jest.Mock;
} {
	return {
		vaultName: "Personal",
		settings,
		exchange: jest.fn().mockResolvedValue(newGarden),
		confirm: jest.fn().mockResolvedValue(confirmed),
		saveSettings: jest.fn().mockResolvedValue(undefined),
		reportVault: jest.fn().mockResolvedValue(undefined),
		notify: jest.fn(),
		logError: jest.fn(),
	};
}

describe("connectWithCode", () => {
	it("asks for confirmation naming the vault, the garden and what it replaces", async () => {
		const deps = makeDeps(makeSettings(), false);

		await connectWithCode("abc", deps);

		expect(deps.exchange).toHaveBeenCalledWith("abc");

		const details: ConnectConfirmDetails = deps.confirm.mock.calls[0][0];
		expect(details.vaultName).toBe("Personal");
		expect(details.gardenLabel).toBe("test-garden.forestry.md");

		expect(details.currentTarget).toBe(
			"This vault currently publishes to old-garden.forestry.md. Connecting will replace that.",
		);
	});

	it("leaves settings untouched when the user cancels", async () => {
		const settings = makeSettings();
		const before = JSON.parse(JSON.stringify(settings));
		const deps = makeDeps(settings, false);

		const outcome = await connectWithCode("abc", deps);

		expect(outcome).toBe("cancelled");
		expect(settings).toEqual(before);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});

	it("leaves a GitHub-configured vault untouched when the user cancels", async () => {
		const settings = makeSettings({
			publishPlatform: PublishPlatform.SelfHosted,
			githubUserName: "me",
			githubRepo: "my-garden",
		});
		const before = JSON.parse(JSON.stringify(settings));
		const deps = makeDeps(settings, false);

		await connectWithCode("abc", deps);

		expect(deps.confirm.mock.calls[0][0].currentTarget).toBe(
			"This vault currently publishes to the GitHub repository me/my-garden. Connecting will switch it to Forestry.md.",
		);
		expect(settings).toEqual(before);
		expect(deps.saveSettings).not.toHaveBeenCalled();
	});

	it("writes and saves settings only after the user confirms", async () => {
		const settings = makeSettings({
			publishPlatform: PublishPlatform.SelfHosted,
		});
		const deps = makeDeps(settings, true);

		deps.confirm.mockImplementation(async () => {
			// Nothing is written while the modal is open.
			expect(settings.publishPlatform).toBe(PublishPlatform.SelfHosted);
			expect(settings.forestrySettings.apiKey).toBe("old-key");

			return true;
		});

		const outcome = await connectWithCode("abc", deps);

		expect(outcome).toBe("connected");
		expect(settings.publishPlatform).toBe(PublishPlatform.ForestryMd);

		expect(settings.forestrySettings).toEqual({
			apiKey: "new-key",
			forestryPageName: "test-garden",
			baseUrl: "test-garden.forestry.md",
		});
		expect(deps.saveSettings).toHaveBeenCalledTimes(1);

		expect(deps.notify).toHaveBeenLastCalledWith(
			"Connected to test-garden.forestry.md. Mark a note with dg-publish and publish it when you're ready.",
			10000,
		);
	});

	it("does not ask or change anything when the code is rejected", async () => {
		const settings = makeSettings();
		const before = JSON.parse(JSON.stringify(settings));
		const deps = makeDeps(settings, true);

		deps.exchange.mockRejectedValue(
			new ForestryApiError("unauthorized", "expired", 404),
		);

		const outcome = await connectWithCode("abc", deps);

		expect(outcome).toBe("failed");
		expect(deps.logError).toHaveBeenCalledTimes(1);
		expect(deps.confirm).not.toHaveBeenCalled();
		expect(deps.saveSettings).not.toHaveBeenCalled();
		expect(settings).toEqual(before);
	});

	it("says when the vault is already connected to the same garden", async () => {
		const settings = makeSettings({
			forestrySettings: { ...newGarden, forestryPageName: "test-garden" },
		} as Partial<DigitalGardenSettings>);
		const deps = makeDeps(settings, false);

		await connectWithCode("abc", deps);

		expect(deps.confirm.mock.calls[0][0].currentTarget).toBe(
			"This vault is already connected to this garden. Connecting again keeps it connected.",
		);
	});

	it("recognises the same garden by name when the stored key differs", async () => {
		const settings = makeSettings({
			forestrySettings: {
				apiKey: "stale-key",
				forestryPageName: "test-garden",
				baseUrl: "",
			},
		} as Partial<DigitalGardenSettings>);
		const deps = makeDeps(settings, false);

		await connectWithCode("abc", deps);

		expect(deps.confirm.mock.calls[0][0].currentTarget).toBe(
			"This vault is already connected to this garden. Connecting again keeps it connected.",
		);
	});

	it("reports the vault name with the new key only after the user confirms", async () => {
		const cancelled = makeDeps(makeSettings(), false);
		await connectWithCode("abc", cancelled);
		expect(cancelled.reportVault).not.toHaveBeenCalled();

		const confirmed = makeDeps(makeSettings(), true);
		await connectWithCode("abc", confirmed);

		expect(confirmed.reportVault).toHaveBeenCalledWith(
			"new-key",
			"Personal",
		);
	});

	it("stays connected when reporting the vault name fails", async () => {
		const settings = makeSettings();
		const deps = makeDeps(settings, true);
		deps.reportVault.mockRejectedValue(new Error("offline"));

		await expect(connectWithCode("abc", deps)).resolves.toBe("connected");
		expect(settings.forestrySettings.apiKey).toBe("new-key");
		expect(deps.logError).toHaveBeenCalled();
	});
});
