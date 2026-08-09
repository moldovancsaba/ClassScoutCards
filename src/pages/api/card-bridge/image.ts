import { NextApiRequest, NextApiResponse } from "next";
import { checkCardBridgeAuth } from "@/lib/auth/requireCardBridgeKey";
import { isImgBbHttpsImageUrl } from "@/lib/delivery/publishGate";

/**
 * POST /api/card-bridge/image — fetch a venue's own photograph from a URL and re-host it on imgbb,
 * returning the `https://i.ibb.co/...` URL a listing's `image` field requires.
 *
 * WHY THIS EXISTS. The main app will not show a listing whose image is not imgbb-hosted
 * (`hasValidOwnImage`), and the owner's rule is stricter still: *"the image is always required and
 * always has to be checked and added to the database"*. Without a re-host step every listing this
 * bridge creates is invisible by construction, so the choice was between an upload path and a bridge
 * that can only ever produce unpublishable records.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *
 * - It does not generate, illustrate or substitute an image. It re-hosts one that already exists at a
 *   URL the caller supplies, and the caller is responsible for that URL being a photograph OF THIS
 *   VENUE. A stock photo or another business's picture would pass every technical check here and still
 *   misrepresent the place a family is deciding to walk to.
 * - It does not write to any listing. It returns a URL; storing it is a separate, audited write, so an
 *   upload can never silently change a record.
 * - It does not accept an already-imgbb URL for re-upload — that would duplicate an image the catalogue
 *   already has, and duplicate images are a defect this repo has counted (63 live records over 16 files).
 *
 * `IMGBB_API_KEY` is read from the environment and never returned, logged, or echoed in an error.
 */

const MAX_BYTES = 8 * 1024 * 1024; // imgbb's own limit for the free tier is 32MB; 8 is ample for a listing photo.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = checkCardBridgeAuth(req.headers.authorization);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "IMGBB_API_KEY is not configured on this deployment. Without it no listing can be given an image, and without an image the main app shows no listing at all.",
    });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sourceUrl = typeof body.sourceUrl === "string" ? body.sourceUrl.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";

  if (!/^https:\/\/\S{6,}$/i.test(sourceUrl)) {
    return res.status(400).json({ error: "sourceUrl must be an https:// URL pointing at a photograph of this venue" });
  }
  if (isImgBbHttpsImageUrl(sourceUrl)) {
    return res.status(400).json({ error: "sourceUrl is already an imgbb URL. Re-hosting it would create a second copy of an image the catalogue already has; use the existing URL, or supply a different photograph." });
  }
  if (!name) {
    return res.status(400).json({ error: "name is required — it becomes the imgbb filename, which is the only way to tell later which listing an upload belongs to" });
  }

  try {
    const fetched = await fetch(sourceUrl, { headers: { "User-Agent": "Mozilla/5.0 (compatible; ClassScoutCards/1.0)" } });
    if (!fetched.ok) {
      return res.status(502).json({ error: `Could not fetch the source image: HTTP ${fetched.status}` });
    }
    const contentType = (fetched.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
      return res.status(415).json({ error: `Source is not an image this bridge accepts (content-type "${contentType || "unknown"}"). Allowed: ${ALLOWED_TYPES.join(", ")}` });
    }
    const buffer = Buffer.from(await fetched.arrayBuffer());
    if (buffer.byteLength === 0) return res.status(502).json({ error: "Source image was empty" });
    if (buffer.byteLength > MAX_BYTES) {
      return res.status(413).json({ error: `Source image is ${Math.round(buffer.byteLength / 1024)}KB, over the ${MAX_BYTES / 1024 / 1024}MB limit` });
    }

    const form = new URLSearchParams();
    form.set("key", apiKey);
    form.set("image", buffer.toString("base64"));
    form.set("name", name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "listing");

    const upload = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const payload = (await upload.json()) as { success?: boolean; data?: { url?: string; display_url?: string }; error?: { message?: string } };
    if (!upload.ok || !payload.success) {
      // The key is never echoed, including on failure.
      return res.status(502).json({ error: `imgbb rejected the upload: ${payload.error?.message ?? `HTTP ${upload.status}`}` });
    }

    const url = payload.data?.display_url ?? payload.data?.url ?? "";
    if (!isImgBbHttpsImageUrl(url)) {
      return res.status(502).json({ error: `imgbb returned a URL the main app's own image gate would reject: ${url}` });
    }

    return res.status(200).json({ url, bytes: buffer.byteLength, contentType, sourceUrl });
  } catch (error) {
    console.error("card-bridge/image error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
