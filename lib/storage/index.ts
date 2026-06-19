import { devStorage } from "./devStorage";
import { supabaseStorage } from "./supabaseStorage";

export function getStorage() {
  return supabaseStorage ?? devStorage;
}
