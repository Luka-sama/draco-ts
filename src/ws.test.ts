import WS from "./ws";

test("bufferToStr", function() {
	const buffer = Buffer.from("test string");
	expect(WS["bufferToStr"](buffer)).toBe("test string");
});