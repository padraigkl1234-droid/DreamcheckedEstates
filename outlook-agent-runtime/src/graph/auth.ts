import { ConfidentialClientApplication } from "@azure/msal-node";
import { config } from "../config.js";

const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: config.MS_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${config.MS_TENANT_ID}`,
    clientSecret: config.MS_CLIENT_SECRET,
  },
});

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * App-only (client credentials) token acquisition. msal-node caches internally,
 * but we keep a thin cache here too so callers don't pay an await on the hot path.
 */
export async function getGraphAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.value;
  }

  const result = await msalApp.acquireTokenByClientCredential({
    scopes: [GRAPH_SCOPE],
  });

  if (!result?.accessToken) {
    throw new Error("Failed to acquire Microsoft Graph access token (client credentials flow).");
  }

  cachedToken = {
    value: result.accessToken,
    expiresAt: result.expiresOn ? result.expiresOn.getTime() : now + 55 * 60_000,
  };

  return cachedToken.value;
}
