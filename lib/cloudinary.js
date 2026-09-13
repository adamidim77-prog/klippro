import crypto from "crypto";

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

export async function cloudinaryUpload({ file, publicId, resourceType, format }) {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = { public_id: publicId, timestamp };
  if (format) paramsToSign.format = format;
  const signature = signCloudinaryParams(paramsToSign);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("public_id", publicId);
  formData.append("timestamp", String(timestamp));
  formData.append("api_key", process.env.CLOUDINARY_API_KEY);
  formData.append("signature", signature);
  if (format) formData.append("format", format);

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
