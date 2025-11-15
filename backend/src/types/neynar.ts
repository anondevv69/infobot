export interface NeynarCast {
  hash: string;
  author: {
    fid: number;
    username: string;
    displayName?: string;
    custodyAddress?: string;
  };
  text: string;
  timestamp: string;
  embeds?: Array<{ url?: string; castId?: { fid: number; hash: string } }>;
}

export interface NeynarCastCreatedEvent {
  type: "cast.created";
  data: {
    cast: NeynarCast;
  };
}

export type NeynarWebhookEvent = NeynarCastCreatedEvent;

