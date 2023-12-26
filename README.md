Theater of Talismans. Server
============================
This is one of the game repositories.

Installation
------------
* Install Node.JS 21
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

LOCALE=en_US
LOCALE_DIR=./locales

WS_PORT=9001
WS_PATH=/ws

UDP_PORT=9002

DEFAULT_LOG_LEVEL=warn
LOG_DESTINATION=console
```
You can change the connection data, the logger options (see the logger documentation for details) or the locale.

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
* Check project with ESLint: `npm run eslint`
* (Re)create database schema and seed database: `node dist/seeder`