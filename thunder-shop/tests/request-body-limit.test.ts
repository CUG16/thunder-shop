import { POST as loginRoute } from '@/app/api/auth/login/route';
import { MAX_BODY_BYTES } from '@/server/http/apiRoute';
import { noUrlParams, startWithFreshDatabase } from './helpers/testApp';

beforeEach(startWithFreshDatabase);

const loginWithBody = (body: BodyInit, headers: Record<string, string> = {}) =>
  loginRoute(
    new Request('http://localhost/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body,
      // Needed by Node to send a stream as the body.
      duplex: 'half',
    } as RequestInit),
    noUrlParams,
  );

/** A body that arrives in chunks with no Content-Length, like a chunked upload. Counts how much was pulled. */
function chunkedBody(chunkCount: number, chunkBytes: number) {
  const stats = { chunksRead: 0 };
  const chunk = new Uint8Array(chunkBytes).fill(0x20); // spaces
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (stats.chunksRead === chunkCount) return controller.close();
      stats.chunksRead += 1;
      controller.enqueue(chunk);
    },
  });
  return { stream, stats };
}

describe('Request body size limit', () => {
  test('a declared Content-Length over the limit is refused before the body is read', async () => {
    const { stream, stats } = chunkedBody(1_000, 1_000);
    const response = await loginWithBody(stream, { 'content-length': String(50 * 1024 * 1024) });

    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('BODY_TOO_LARGE');
    expect(stats.chunksRead).toBeLessThanOrEqual(1);
  });

  test('a chunked body with no Content-Length is cut off once it passes the limit', async () => {
    // 1,000 chunks of 1 KB = 1 MB on offer. Reading must stop just after 10 KB.
    const { stream, stats } = chunkedBody(1_000, 1_000);
    const response = await loginWithBody(stream);

    expect(response.status).toBe(413);
    expect(stats.chunksRead).toBeLessThan(20);
  });

  test('the limit counts bytes, not characters', async () => {
    // Each "€" is 3 bytes in UTF-8, so this is under the limit in characters but over it in bytes.
    const body = JSON.stringify({ email: 'alice@releaseshop.test', password: '€'.repeat(MAX_BODY_BYTES / 2) });
    const response = await loginWithBody(body);
    expect(response.status).toBe(413);
  });

  test('a normal login body still works, including non-ASCII text', async () => {
    const response = await loginWithBody(JSON.stringify({ email: 'alice@releaseshop.test', password: 'Alice-Pass-123' }));
    expect(response.status).toBe(200);

    const wrongPassword = await loginWithBody(JSON.stringify({ email: 'alice@releaseshop.test', password: 'pässwörd-€' }));
    expect(wrongPassword.status).toBe(401);
  });
});
