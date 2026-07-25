import "server-only";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set in .env.local"
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function createSignedUploadUrl(path: string) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from("clips")
    .createSignedUploadUrl(path);
  if (error) throw error;
  return data; // { signedUrl, path, token }
}

export async function createSignedPlaybackUrl(path: string, expiresInSeconds = 3600) {
  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from("clips")
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
