# AGENTS.md

Instrucciones para agentes que trabajen en este repositorio.

## Verificaciones automáticas

**No ejecutes verificación de tipos ni linters salvo que se te pida explícitamente.**

Eso incluye, entre otros:

- `pnpm astro check` / `astro check`
- `tsc`, `tsc --noEmit`, `pnpm packages:typecheck`
- `eslint`, `pnpm lint`, cualquier comando de linting
- `pnpm test` / `vitest` salvo petición expresa

Razón: estos comandos son largos en este proyecto y rara vez aportan información que el agente no pueda obtener con `ReadLints` puntual sobre los ficheros modificados. Confía en `ReadLints` y en la inspección manual a no ser que el usuario pida lo contrario.

Si el usuario dice algo como "verifica tipos", "pasa el typecheck", "corre los tests", "lint el proyecto" o equivalentes, entonces sí debes ejecutarlos.

## Gestor de paquetes

Usa siempre `pnpm` salvo que exista `bun.lock` en el subpaquete (entonces usa `bun`). Nunca `npm`.
