/**
 * Vercel Blob 用の写真保存（VERCEL 環境時）
 * ローカルでは使わない（api.js で分岐）
 */
import { put, del } from "@vercel/blob";

export async function putPhoto(buffer, filename) {
  const blob = await put(`photos/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function putThumb(buffer, filename) {
  const blob = await put(`thumbs/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function deleteBlob(url) {
  if (url && url.startsWith("http")) await del(url).catch(() => {});
}
