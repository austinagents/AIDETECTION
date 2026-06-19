import { devStorage } from "./devStorage";
import { isSupabaseConfigured } from "./supabaseStorage";
import { supabaseStorage } from "./supabaseStorage";

export function getStorage() {
  return supabaseStorage ?? devStorage;
}

export function getStorageMode(): "supabase" | "dev" {
  return isSupabaseConfigured() ? "supabase" : "dev";
}
