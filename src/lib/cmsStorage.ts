import { supabase } from "@/integrations/supabase/client";

export const CMS_IMAGE_BUCKET = "cms-images";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadCmsImage(file: File, folder = "hero") {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Unsupported image type. Use JPG, PNG, WEBP, GIF, or SVG.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image is too large. Maximum size is 10 MB.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "-").replace(/\/+$/, "") || "hero";
  const path = `${safeFolder}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(CMS_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(CMS_IMAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}
