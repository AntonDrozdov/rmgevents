# Local containers

Both images use the same SemVer tag, stored in `.env` as `APP_VERSION`.
Both local and server Compose files require this variable and use the same tags.
Run from the repository root:

```powershell
./deploy/rebuild.ps1              # Patch: 1.1.1 -> 1.1.2
./deploy/rebuild.ps1 -Bump minor  # New functionality: 1.1.2 -> 1.2.0
./deploy/rebuild.ps1 -Bump major  # Breaking changes: 1.2.0 -> 2.0.0
./deploy/rebuild.ps1 -Bump none   # Rebuild the current version
```

The script builds and recreates both containers, then saves the version on success.
Previous image tags remain available for rollback.

For server deployment, copy `docker-compose.yml` and `.env` together, and load
both images with the version from `.env`. `transfer-images.cmd` reads that same
version when streaming `docker save` directly through SSH into server-side
`docker load`, without archive files. It then copies `docker-compose.yml` and `.env`
to `/opt/rmgevents` on the configured server. It checks that both versioned
images exist before transfer and validates the remote Compose configuration.
It does not restart containers.
Run on the server from the directory containing these files:

```sh
docker compose --env-file .env -f docker-compose.yml up -d --no-build --pull never
```

This fails if the specified images have not been loaded locally. PostgreSQL and
the external `danetwork` network must already be available on the server.
Environment variables override `.env`; do not set a different `APP_VERSION` in
the shell when deploying the saved version.
