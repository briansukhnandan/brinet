# brinet
Brinet is a custom feed that pulls info from multiple data sources, and uploads them to Bluesky.

These data sources include:
- Actions on Bills in the US Congress [@worldnews-tracker.bsky.social](https://bsky.app/profile/did:plc:a6tynmyiald4k5swuwpb5fmx)
- Reddit r/worldnews [@congress-tracker.bsky.social](https://bsky.app/profile/did:plc:3dmyptxkaz4wxun4fm4ouqd4)

To setup, PTAL at, fill out, and rename `.env-template` to `.env`. Be sure to also set `ENVIRONMENT` to `"prod"`.
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

### Running with Docker
Generate a container called `brinet` and then run it:
```
docker build -t brinet .
docker run -it brinet
```
