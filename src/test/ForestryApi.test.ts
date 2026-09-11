import axios from "axios";
import ForestryApi, { ForestryApiError } from "../forestry/ForestryApi";

jest.mock("axios", () => {
	const actual = jest.requireActual("axios");

	return {
		__esModule: true,
		...actual,
		default: {
			...actual.default,
			post: jest.fn(),
			create: jest.fn(),
			isAxiosError: actual.default.isAxiosError,
		},
	};
});

const mockedPost = axios.post as jest.Mock;
const mockedCreate = axios.create as jest.Mock;

function axiosError(status?: number, data?: unknown) {
	const err = new Error(`status ${status}`) as Error & {
		isAxiosError: boolean;
		response?: { status: number; data: unknown };
	};
	err.isAxiosError = true;

	if (status) {
		err.response = { status, data };
	}

	return err;
}

describe("ForestryApi.exchangeConnectCode", () => {
	beforeEach(() => mockedPost.mockReset());

	it("posts the code and returns the connection", async () => {
		mockedPost.mockResolvedValue({
			status: 200,
			data: {
				value: {
					apiKey: "key",
					pageName: "quiet-grove",
					baseUrl: "quiet-grove.forestry.md",
				},
			},
		});

		const result = await ForestryApi.exchangeConnectCode("abc");

		expect(result.pageName).toBe("quiet-grove");

		expect(mockedPost.mock.calls[0][0]).toMatch(/\/connect\/exchange$/);
		expect(mockedPost.mock.calls[0][1]).toEqual({ code: "abc" });
	});

	it("reports an invalid/expired code as unauthorized", async () => {
		mockedPost.mockRejectedValue(
			axiosError(404, { errorMessage: "Code expired" }),
		);

		await expect(ForestryApi.exchangeConnectCode("old")).rejects.toEqual(
			expect.objectContaining({ kind: "unauthorized", status: 404 }),
		);
	});

	it("reports network failures as unreachable", async () => {
		mockedPost.mockRejectedValue(axiosError());

		const err = await ForestryApi.exchangeConnectCode("x").catch((e) => e);
		expect(err).toBeInstanceOf(ForestryApiError);
		expect(err.kind).toBe("unreachable");
	});
});

describe("ForestryApi.getPageInfoResult", () => {
	it("distinguishes a rejected key from an unreachable server", async () => {
		const get = jest.fn().mockRejectedValue(axiosError(401));
		mockedCreate.mockReturnValue({ get });

		const rejected = await new ForestryApi("bad").getPageInfoResult();

		expect(rejected).toEqual(
			expect.objectContaining({ ok: false, kind: "unauthorized" }),
		);

		get.mockRejectedValue(axiosError(503));

		const down = await new ForestryApi("bad").getPageInfoResult();

		expect(down).toEqual(
			expect.objectContaining({ ok: false, kind: "unreachable" }),
		);
	});
});
