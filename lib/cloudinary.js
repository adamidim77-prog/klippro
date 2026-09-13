import crypto from "crypto";

// Cloudinary mewajibkan setiap upload authenticated ditandatangani (signature),
// dihitung dari SEMUA parameter (kecuali file, cloud_name, api_key, resource_type)
// diurutkan alfabetis, digabung "key=value", lalu di-SHA1 bareng api_secret.
function signCloudinaryParams(params) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto
    .createHash("sha1")
    .update(sorted + process.env.CLOUDINARY_API_SECRET)
    .digest("hex");
}

// Upload SERVER-SIDE (bisa dari file lokal ATAU dari URL remote — Cloudinary akan
// mengambil sendiri URL itu, kita tidak perlu download-lalu-upload manual).
export async function cloudinaryUpload({ file, publicId, resourceType }) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { public_id: publicId, timestamp };
  const signature = signCloudinaryParams(paramsToSign);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("public_id", publicId);
  formData.append("timestamp", String(timestamp));
  formData.append("api_key", process.env.CLOUDINARY_API_KEY);
  formData.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${resourceType}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal upload ke Cloudinary (${resourceType}): ${errText}`);
  }
  return res.json();
}
