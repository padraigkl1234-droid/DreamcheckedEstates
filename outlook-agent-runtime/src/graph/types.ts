export interface GraphEmailAddress {
  emailAddress?: {
    name?: string;
    address?: string;
  };
}

export interface GraphMessage {
  id: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: {
    contentType?: "text" | "html";
    content?: string;
  };
  receivedDateTime?: string;
  from?: GraphEmailAddress;
  sender?: GraphEmailAddress;
  hasAttachments?: boolean;
}

export interface GraphMessageListResponse {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  // Only present for #microsoft.graph.fileAttachment
  contentBytes?: string;
}

export interface GraphAttachmentListResponse {
  value: GraphAttachment[];
}
