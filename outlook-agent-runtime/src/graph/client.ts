import { config } from "../config.js";
import { getGraphAccessToken } from "./auth.js";
import type {
  GraphAttachment,
  GraphAttachmentListResponse,
  GraphMessage,
  GraphMessageListResponse,
} from "./types.js";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Every call in this module is a GET. This service must never send, reply,
 * delete, move, or modify mail — Mail.Read (application) enforces that at the
 * permission level, but we also only ever issue read requests here.
 */
async function graphGet<T>(path: string): Promise<T> {
  const token = await getGraphAccessToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph GET ${url} failed: ${res.status} ${res.statusText} ${body}`);
  }

  return (await res.json()) as T;
}

const mailboxPath = () => `/users/${encodeURIComponent(config.MS_MAILBOX_UPN)}`;

/** Read-only proof step: latest N messages from the inbox, newest first. */
export async function listRecentMessages(top = 10): Promise<GraphMessage[]> {
  const select = "id,internetMessageId,subject,bodyPreview,receivedDateTime,from,sender,hasAttachments";
  const path = `${mailboxPath()}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${select}`;
  const data = await graphGet<GraphMessageListResponse>(path);
  return data.value;
}

/**
 * Delta query against the inbox: first call with no deltaLink returns all
 * current messages + a deltaLink; subsequent calls with that deltaLink
 * return only what changed since. Callers persist the deltaLink to only
 * ever fetch new mail.
 */
export async function fetchInboxDelta(
  deltaLink?: string
): Promise<{ messages: GraphMessage[]; nextDeltaLink: string }> {
  const select = "id,internetMessageId,subject,bodyPreview,receivedDateTime,from,sender,hasAttachments";
  let path = deltaLink ?? `${mailboxPath()}/mailFolders/inbox/messages/delta?$select=${select}`;

  const messages: GraphMessage[] = [];
  let nextDeltaLink: string | undefined;

  while (!nextDeltaLink) {
    const data = await graphGet<GraphMessageListResponse>(path);
    messages.push(...data.value);

    if (data["@odata.nextLink"]) {
      path = data["@odata.nextLink"];
    } else if (data["@odata.deltaLink"]) {
      nextDeltaLink = data["@odata.deltaLink"];
    } else {
      // Shouldn't happen per Graph delta contract, but avoid an infinite loop.
      break;
    }
  }

  return { messages, nextDeltaLink: nextDeltaLink ?? deltaLink ?? "" };
}

export async function getMessageBody(messageId: string): Promise<GraphMessage> {
  const select = "id,subject,body,receivedDateTime,from,sender,hasAttachments";
  return graphGet<GraphMessage>(`${mailboxPath()}/messages/${messageId}?$select=${select}`);
}

export async function listAttachments(messageId: string): Promise<GraphAttachment[]> {
  const data = await graphGet<GraphAttachmentListResponse>(
    `${mailboxPath()}/messages/${messageId}/attachments`
  );
  return data.value;
}
