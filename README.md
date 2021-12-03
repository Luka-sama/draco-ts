Theater of Talismans. Server
============================
This is one of the game repositories.

Installation
------------

* Install Node.JS 16.13.0 or newer
* Install PostgreSQL 14.0 or newer
* Create database enveltia (encoding UTF8, collation C)
* Clone the project from GitHub
* Execute the command `npm ci` to install node modules
* Build the project with `npx tsc`
* Create .env-file with the content:
```
MIKRO_ORM_HOST = localhost
MIKRO_ORM_PORT = 5432
MIKRO_ORM_USER = postgres
MIKRO_ORM_PASSWORD = YOUR_PASSWORD_HERE
MIKRO_ORM_DB_NAME = enveltia
MIKRO_ORM_DEBUG = false
WS_DEBUG = false
```
You can change the connection data or the debug options.

Editor setup
------------
PhpStorm is recommended to edit the project,  but you can use the editor of your choice.
In the case of another editor, however, you will have to find out for yourself how to set up the editor.
* Go to File | Settings… | Editor | Code Style and select "Unix and macOS (\n)" as line separator.
* Go to File | Settings… | Editor | Code Style | TypeScript and check Sort imports by modules on the Imports tab.
* Go to File | Settings… | Tools | Actions on Save | Optimize Imports

Useful commands
---------------
* Run server: `node dist`
* Build project: `npx tsc`
* Generate documentation: `npx typedoc`
* Run tests: `npx jest` or `npm t`
* Run mutants: `npx stryker run`