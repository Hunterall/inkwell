import { createMiddleware } from "@tanstack/react-start";
import { auth } from "./client";

// Attaches the Firebase ID token as a Bearer token on every server function call.
export const attachFirebaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const user = auth.currentUser;
    const token = user ? await user.getIdToken() : null;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
