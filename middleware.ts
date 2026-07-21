export { default } from "next-auth/middleware";

// Protect dashboard and admin areas. Public routes (/, /form, /encuesta, /login,
// /api/public) are intentionally excluded.
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
