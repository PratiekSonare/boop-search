declare function fetch(input: string | URL | Request, init?: RequestInit): Promise<Response>;

interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface Response {
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<any>;
}
