export class RequestTooLarge extends Error {}
export async function readBoundedBody(
  request: Request,
  maximumBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.length;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new RequestTooLarge();
    }
    parts.push(chunk.value);
  }
  return new Uint8Array(Buffer.concat(parts));
}
