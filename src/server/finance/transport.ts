import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { FinanceError } from "./types";

export type JsonTransport = (
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal,
) => Promise<unknown>;
export function publicIpv4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255))
    return false;
  return !(
    p[0] === 0 ||
    p[0] === 10 ||
    p[0] === 127 ||
    p[0] >= 224 ||
    (p[0] === 169 && p[1] === 254) ||
    (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
    (p[0] === 192 && (p[1] === 168 || p[1] === 0)) ||
    (p[0] === 100 && p[1] >= 64 && p[1] <= 127) ||
    (p[0] === 198 && (p[1] === 18 || p[1] === 19))
  );
}
export function validateEndpoint(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new FinanceError(
      "استخدم عنوان HTTPS عام بدون بيانات دخول أو query parameters.",
    );
  return url;
}
/** DNS is pinned to a validated public address on the actual socket, not just
 * checked before fetch. No redirects, no proxy env, bounded response/time. */
export const safeJsonPost: JsonTransport = async (
  value,
  body,
  headers,
  signal,
) => {
  const url = validateEndpoint(value);
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length || addresses.some((a) => !publicIpv4(a.address)))
    throw new FinanceError(
      "الاتصال بعناوين الشبكة الداخلية غير مسموح من هذه الواجهة.",
    );
  const pinned = addresses[0].address;
  const combined = AbortSignal.any([
    AbortSignal.timeout(60000),
    ...(signal ? [signal] : []),
  ]);
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        signal: combined,
        // Node may request either one address or all addresses.
        lookup: ((_host: any, options: any, callback: any) =>
          options?.all
            ? callback(null, [{ address: pinned, family: 4 }])
            : callback(null, pinned, 4)) as any,
      },
      (res) => {
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(
            new FinanceError(
              `الخدمة رفضت الاتصال (HTTP ${res.statusCode ?? "unknown"}). راجع الإعدادات والصلاحيات.`,
              502,
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 2_000_000) {
            res.destroy();
            reject(
              new FinanceError("استجابة الخدمة أكبر من الحد المسموح.", 502),
            );
          } else chunks.push(chunk);
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new FinanceError("استجابة الخدمة غير صالحة.", 502));
          }
        });
        res.on("error", () =>
          reject(new FinanceError("انقطع الاتصال بالخدمة.", 502)),
        );
      },
    );
    req.on("error", () =>
      reject(
        new FinanceError(
          combined.aborted
            ? "توقف الاتصال أو انتهت مهلة الخدمة."
            : "تعذر الاتصال بالخدمة. راجع العنوان والشبكة.",
          502,
        ),
      ),
    );
    req.end(JSON.stringify(body));
  });
};
