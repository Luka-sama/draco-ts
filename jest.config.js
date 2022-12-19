/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: "ts-jest",
  rootDir: "src/",
  testEnvironment: "node",
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "../coverage/",
  coverageProvider: "v8",
  coverageReporters: ["lcov"],
  setupFilesAfterEnv: ["./jest-setup.ts"],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  }
};