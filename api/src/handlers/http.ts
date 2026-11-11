export type FetchFunction = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export type Environment = Readonly<Record<string, string | undefined>>;
