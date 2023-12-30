import "dotenv/config";
import pg from "pg";

export default class DB {
	private pool: pg.Pool;

	/** Connects to the database */
	public constructor() {
		this.pool = new pg.Pool({
			host: process.env.DB_HOST,
			port: +process.env.DB_PORT!,
			user: process.env.DB_USER,
			password: process.env.DB_PASSWORD,
			database: process.env.DB_DATABASE
		});
		this.pool.on("error", (err, client) => {
			console.error("Unexpected error on idle DB client", err, client);
		});
	}

	/** Closes database connection */
	public async close(): Promise<void> {
		await this.pool.end();
	}

	/** Executes any raw SQL query and returns it as QueryResult object (see node-postgres documentation) */
	public async query(queryText: string, values?: any[]): Promise<pg.QueryResult> {
		//await DB.flush(); // Flush changes to ensure that the query returns fresh results
		try {
			return await this.pool.query(queryText, values);
		} catch(e) {
			console.error(e, queryText, values);
			throw e;
		}
	}

	/*static async delete(table: string, where: string): Promise<pg.QueryResult> {
		return await DB.query(`DELETE FROM ${table} WHERE ${where}`);
	}*/
}