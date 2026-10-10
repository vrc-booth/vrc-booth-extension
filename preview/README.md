# BoothPlus local UI preview

A local-only demonstration of the **actual** `components/ReviewBoard.tsx` and
`entrypoints/user.sidepanel/App.tsx` components, using synthetic in-memory data.
This is a web preview, not an installed extension or a live API test.

## Run

From the repository root:

```sh
bun run preview
```

Open http://localhost:4173/ or http://127.0.0.1:4173/.
Vite binds to loopback `127.0.0.1:4173`; do not expose this development server publicly.

Direct states:

- `/?state=signed-out`: public reviews and login prompt
- `/?state=signed-in`: locally editable reviews
- `/?state=account`: username and paginated comment history
- `/?state=empty`: empty reviews and first-comment form

The language selector reads the real Korean, English, and Japanese locale YAML.
Login is simulated without opening Discord. Comment posting/editing/deleting and
username updates change memory only. The reset button or page reload discards them.

## Isolation

The preview Vite config aliases the extension API, messaging, storage, browser API,
and locale module. API mocks make no network requests. A fetch guard blocks external
requests and network writes; a content security policy also restricts connections
to this local origin and the local Vite development websocket. No production URL,
credentials, browser extension permissions, or persistent storage are used.

## Check the bundle

```sh
./node_modules/.bin/vite build --config preview.vite.config.ts
bun run compile
./node_modules/.bin/vitest run preview/preview.test.ts
```

The optional static build is generated in `preview/dist` (ignored by Git). This
preview does not change the extension's WXT build configuration or production files.

The preview bundle, TypeScript check, and fixture/network-isolation tests pass.
Visual browser QA was blocked by the cloud browser policy for the loopback URL;
this preview does not establish that the extension is installed or that live OAuth works.
