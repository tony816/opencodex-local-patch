import type { AdapterEvent, OcxParsedRequest } from "../types";

export interface ProviderAdapter {
  name: string;

  buildRequest(parsed: OcxParsedRequest): {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
  };

  parseStream(response: Response): AsyncGenerator<AdapterEvent>;
  parseResponse?(response: Response): Promise<AdapterEvent[]>;
}
