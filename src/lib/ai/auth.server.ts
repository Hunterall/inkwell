import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const PROJECT_ID = process.env["VITE_FIREBASE_PROJECT_ID"] ?? "";
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

/** Verifies a Firebase ID token and returns the user ID, or null if invalid. */
export async function verifyRequestUser(request: Request): Promise<string | null> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
