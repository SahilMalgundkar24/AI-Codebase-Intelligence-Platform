/** Turn low-level Node/undici errors into actionable messages */
export function formatServiceError(err: unknown, step: string): string {
  if (!(err instanceof Error)) {
    return `Failed during ${step}.`;
  }

  const cause =
    err.cause instanceof Error
      ? err.cause.message
      : err.cause != null
        ? String(err.cause)
        : "";

  const msg = err.message.toLowerCase();

  if (msg === "fetch failed" || msg.includes("fetch failed")) {
    const hint = cause.includes("ENOTFOUND")
      ? "DNS could not resolve the host — check internet or VPN."
      : cause.includes("ECONNREFUSED")
        ? "Connection refused — firewall or proxy may be blocking outbound HTTPS."
        : cause.includes("CERT") || cause.includes("TLS")
          ? "TLS/SSL error — check system clock and antivirus HTTPS scanning."
          : "Check internet, VPN, and firewall access to GitHub (api.github.com, raw.githubusercontent.com) and Pinecone (api.pinecone.io).";

    return `Network error while ${step}: ${hint}${cause ? ` (${cause})` : ""}`;
  }

  return err.message || `Failed during ${step}.`;
}
