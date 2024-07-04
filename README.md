draco-ts
============================
This is the repository for the MMO(RPG) framework. Currently in development.

Installation
------------
* Install Node.JS 22
* Install PostgreSQL 16
* Create database `test-draco-ts` (encoding UTF8, collation C) and the corresponding user with the same name
* Clone the project from GitHub
* Execute the command `npm ci` to install node modules
* Build the project with `npx tsc`
* Create .env-file with the content:
```
NODE_ENV=test

DB_URL=postgres://test-draco-ts:YOUR_PASSWORD_HERE@localhost:5432/test-draco-ts

LOCALE=en_US
LOCALE_DIR=./locales

WS_PORT=9001
WS_PATH=/ws

UDP_PORT=9002

DEFAULT_LOG_LEVEL=warn
LOG_DESTINATION=console
```
You can change the connection data, the logger options (see the logger documentation for details) or the locale.

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