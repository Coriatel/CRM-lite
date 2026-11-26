export interface AtlasApi {
  go(patch: Record<string, unknown>, push?: boolean): void;
  back(): void;
  readonly S: Record<string, unknown>;
  destroy(): void;
}
/** Draws the atlas into `root` from the System map JSON (GET /api/system/map); `onExit` closes it. */
export function mountAtlas(root: HTMLElement, data: unknown, opts?: { onExit?: () => void; privateIds?: Record<string, string> }): AtlasApi;
