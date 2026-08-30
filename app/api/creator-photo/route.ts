import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publicDir = path.join(process.cwd(), "public");
    const [part1, part2] = await Promise.all([
      readFile(path.join(publicDir, "patrick-web-01.b64"), "utf8"),
      readFile(path.join(publicDir, "patrick-web-02.b64"), "utf8"),
    ]);

    const base64 = `${part1}${part2}`.replace(/\s/g, "");
    const image = Buffer.from(base64, "base64");

    if (image.length < 1000 || image[0] !== 0xff || image[1] !== 0xd8) {
      throw new Error("INVALID_JPEG_DATA");
    }

    return new Response(image, {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Length": String(image.length),
      },
    });
  } catch (error) {
    console.error("[Creator photo route]", error);
    return new Response("Creator photo unavailable", { status: 500 });
  }
}
