# 0001 - stack e limites
Status: accepted
Context: site estático + dados públicos; AGENTS.md raiz pede crates core/api/realtime/proxy/controller (perfil de serviço Rust com PostgreSQL), que não se aplica a um site de transparência sem banco.
Decision: monorepo único; web em TS/Bun; Rust em `crates/{etl,worker,og}`; sem PostgreSQL — dados como JSON estático versionado (`/data/v1`); contrato em `packages/contracts`.
Consequences: deploy único na Cloudflare; sem estado de servidor; mudança de schema exige `v2` paralelo.
