Theater of Talismans. Server
============================
This is one of the game repositories.

Installation
------------
* Install Node.JS 18
* Install PostgreSQL 15
* Create database enveltia (encoding UTF8, collation C)
* Clone the project from GitHub
* Execute the command `npm ci` to install node modules
* Build the project with `npx tsc`
* Create .env-file with the content:
```
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=YOUR_PASSWORD_HERE
DB_DATABASE=enveltia
WS_PORT=9001
LOCALE=en_US
LOG_DESTINATION=console
DEFAULT_LOG_LEVEL=warn
```
You can change the connection data, the logger options or the locale.

`LOG_DESTINATION` can be `console` or `file`. For files, you can specify their location with `LOG_DIR=logs/`.

You can also specify the default log level (`debug`, `info`, `warn`, `error` or `silent`) or the log level for a specific component, e.g. `WS_LOG_LEVEL=info` will log all communication between the server and the client.
If you specify `WS_LOG_LEVEL=debug`, the events for unconnected users will also be logged.
* Create database schema and seed database with `node dist/seeder`

PhpStorm setup
------------
PhpStorm is recommended to edit the project.
* Go to File | Settings… | Editor | Code Style | TypeScript and check Sort imports by modules on the Imports tab.
* Go to File | Settings… | Tools | Actions on Save and choose Optimize Imports.

Useful commands
---------------
* Run server: `node dist`
* Build project: `npx tsc`
* Generate documentation: `npx typedoc`
* Run tests: `npm t`
* Run mutants: `npx stryker run`
* Check project with ESLint: `npm run eslint`
* (Re)create database schema and seed database: `node dist/seeder`