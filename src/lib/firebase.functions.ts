import { createServerFn } from "@tanstack/react-start";

/**
 * The Firebase Web API key is a public/identifying key, but it is stored as a
 * project secret here, so we hand it to the browser through a server function.
 */
export const getFirebaseApiKey = createServerFn({ method: "GET" }).handler(async () => {
  const apiKey = process.env["GOOGLE_API_KEY"] ?? "";
  return { apiKey };
});
