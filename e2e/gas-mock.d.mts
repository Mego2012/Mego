export interface GasSheet { data: unknown[][]; getLastRow(): number; name: string }
export interface Gas {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post(body: Record<string, unknown>): any;
  setup(): string;
  sheetNames(): string[];
  sheet(name: string): GasSheet;
  drive: { copies: string[]; files: { name: string; size: number }[] };
  props: Map<string, string>;
}
export function createGas(opts?: { foodRows?: unknown[][]; token?: string; spreadsheetName?: string }): Gas;
