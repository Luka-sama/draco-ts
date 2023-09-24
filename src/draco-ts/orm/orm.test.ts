import ORM from "./orm.js";

test("ORM.query", async () => {
	const result = await ORM.query("SELECT 'test' AS field");
	expect(result.rows[0].field).toBe("test");
});

describe("ORM.flush", () => {
	test("ORM.flush (insert)", () => {

	});
});