// Local dev entrypoint. Sets NODE_ENV=development (cross-platform, no
// cross-env dependency) BEFORE anything reads it, then boots the server.
// This is what enables the unauthenticated dev auth fallbacks — see env.ts.
// Production runs `node dist/server.js` directly and never touches this file.
process.env.NODE_ENV ??= "development";
await import("./server.js");
