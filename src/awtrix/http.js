// -----------------------------------------------------------------------------
// The one function that talks to the network: an HTTP request to a clock, on
// node:http. AWTRIX 3 serves plain HTTP only, on port 80 by default.
//
// The client takes this function as a parameter: the tests replace it with
// in-memory clocks (test/helpers/fakeAwtrix.js), and test/http.test.js runs it
// against a real local HTTP server.
// -----------------------------------------------------------------------------

import http from 'node:http';

// The clock answers a few kilobytes at most (/api/settings is the largest).
const MAX_BODY_BYTES = 256 * 1024;

/**
 * @param {string} url absolute http:// URL
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {Record<string, string>} [options.headers]
 * @param {unknown} [options.json] body, sent as JSON
 * @param {string} [options.body] raw body (an empty string deletes a custom app)
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{ status: number, headers: Record<string, string>, body: string }>}
 */
export function httpRequest(
  url,
  { method = 'GET', headers = {}, json, body, timeoutMs = 5000 } = {},
) {
  const target = new URL(url);
  const payload =
    json !== undefined
      ? Buffer.from(JSON.stringify(json))
      : body !== undefined
        ? Buffer.from(body)
        : undefined;
  const requestHeaders = {
    accept: 'application/json',
    ...headers,
    ...(payload
      ? {
          'content-type': json !== undefined ? 'application/json' : 'text/plain',
          'content-length': payload.length,
        }
      : {}),
  };

  return new Promise((resolve, reject) => {
    const request = http.request(
      target,
      { method, headers: requestHeaders, timeout: timeoutMs },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            request.destroy(new Error('Response too large'));
            return;
          }
          chunks.push(chunk);
        });
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        response.on('error', reject);
      },
    );
    request.on('timeout', () => {
      const error = new Error(`Timed out after ${timeoutMs} ms`);
      error.code = 'ETIMEDOUT';
      request.destroy(error);
    });
    request.on('error', reject);
    request.end(payload);
  });
}
