import WS from "./ws";

test("bufferToStr", () => {
	const buffer = Buffer.from("test string");
	expect(WS["bufferToStr"](buffer)).toBe("test string");
});