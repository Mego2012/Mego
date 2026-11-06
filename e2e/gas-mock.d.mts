export const HUB_ID: string;
export interface GasSheet { data: unknown[][]; getLastRow(): number; name: string }
export interface Gas {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post(body: Record<string, unknown>): any;
  setup(): string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  migrateHub(): any[][];
  convert(): string;
  sheetNames(): string[];
  sheet(name: string): GasSheet;
  ss: { name: string };
  drive: { copies: string[]; files: { name: string; size: number }[] };
  props: Map<string, string>;
  state: { mode: string; tmpFiles: { id: string; name: string }[]; trashed: string[] };
}
export function createGas(opts?: { foodRows?: unknown[][]; token?: string; spreadsheetName?: string; mode?: 'native' | 'xlsx' }): Gas;
