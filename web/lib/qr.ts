import crypto from "crypto";
import { mustGetEnv } from "./env";

/**
 * 產生一個不可預測的 token（作為 QR 的 payload）。
 * DB 也會自動產生 shipments.qr_code；此工具用於 App 層加鹽、避免猜測。
 * 注意：MVP 可直接使用 DB qr_code；這裡提供加鹽版本，保留未來升級空間。
 */
export function peppered(code: string) {
  const pepper = mustGetEnv("APP_QR_PEPPER");
  return crypto.createHash("sha256").update(`${pepper}:${code}`).digest("hex");
}
