# brinet
Brinet is a custom feed that pulls info from multiple data sources, and uploads them to Bluesky.

These data sources include:
- Actions on Bills in the US Congress
- Reddit r/worldnews

To setup, PTAL at, fill out, and rename `.env-template` to `.env`.
Then, setup the DB by running the bootstrap script by running the following from the root of the project:
```
chmod +x ./src/db/bootstrap_db.sh
./src/db/bootstrap_db.sh
```
If the file `./src/db/brinet.db` now exists, you're all set!

You should then be able to run `brinet` locally with the following command from the root of the project:
```
npm run start
```
