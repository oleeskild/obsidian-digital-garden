module.exports = {
	preset: "ts-jest/presets/js-with-ts",
	testEnvironment: "node",
	setupFiles: ["./jest.setup.ts"],
	moduleNameMapper: { "^src/(.*)$": "<rootDir>/src/$1" },
};
