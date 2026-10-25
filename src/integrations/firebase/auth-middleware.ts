import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const PROJECT_ID = process.env["VITE_FIREBASE_PROJECT_ID"] || "inkwell-52cb5";
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

async function verifyFirebaseToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });
  const uid = payload.sub;
  if (!uid) throw new Error("Unauthorized: No user ID in token");
  return uid;
}

export const requireFirebaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    if (!request?.headers) throw new Error("Unauthorized: No request headers");

    const authHeader = request.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Unauthorized: Bearer token required");

    const token = authHeader.slice(7);
    if (!token) throw new Error("Unauthorized: Empty token");

    const userId = await verifyFirebaseToken(token);
    return next({ context: { userId, token } });
  },
);
