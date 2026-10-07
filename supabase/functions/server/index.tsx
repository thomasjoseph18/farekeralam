import app from "./service.ts";

Deno.serve(app.fetch);
