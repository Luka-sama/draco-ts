import WS from "./ws";

test("bufferToStr", () => {
	const testString = "test string";
	const buffer = Buffer.from(testString);
	expect(WS["bufferToStr"](buffer)).toBe(testString);
});