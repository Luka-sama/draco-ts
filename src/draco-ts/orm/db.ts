import pg from "pg";

export default class DB {
	private static pool: pg.Pool;

	/** Connects to the database */
	static init(): void {
		DB.pool = new pg.Pool({
			host: process.env.DB_HOST,
			port: +process.env.DB_PORT!,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			database: process.env.DB_DATABASE
		});
		DB.pool.on("error", (err, client) => {
			console.error("Unexpected error on idle DB client", err, client);
		});
	}

	/** Closes database connection */
	static async close(): Promise<void> {
		await DB.pool.end();
	}

	/** Executes any raw SQL query and returns it as QueryResult object (see node-postgres documentation) */
	static async query(queryText: string, values?: any[]): Promise<pg.QueryResult> {
		//await DB.flush(); // Flush changes to ensure that the query returns fresh results
		try {
			return await DB.pool.query(queryText, values);
		} catch(e) {
			console.error(e, queryText, values);
			throw e;
		}
	}

	/*static async delete(table: string, where: string): Promise<pg.QueryResult> {
		return await DB.query(`DELETE FROM ${table} WHERE ${where}`);
	}*/
}