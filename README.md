# Fruit Commerce MVP (Web + Supabase) — 可營運履約核心

這是一個「水果經銷電商」MVP 的工程整合包：**訂單 → Shipment → Route 派單 → 司機掃碼 → 照片存證 → 日結**。

> 你不需要改任何程式碼。這包已經把結構、API、DB 規則、狀態機都封好。
>
> 注意：我無法替你登入/建立 Supabase 專案或替你按 Deploy（外部平台權限限制），但這份包已把需要貼上的 SQL 與部署參數完整整理成「最短點擊流程」。

---

## 你要做的事（最短流程）

### A) Supabase（滑鼠操作）
1. Supabase 建立 New Project（取名任意）
2. 進入 **SQL Editor** → 新建 Query
3. 把 `database/ALL_IN_ONE.sql` 全部貼上 → 執行（Run）

### B) Vercel（滑鼠操作）
1. 把整包上傳到 GitHub（或直接匯入資料夾）
2. Vercel → Import Project
3. 設定環境變數（照 `web/.env.example`）
4. Deploy

---

## 環境變數（Vercel / 本機都一樣）

請到 Supabase 專案設定拿到 URL 與 Key。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`  **（只放在伺服器端：Vercel Env）**
- `APP_QR_PEPPER`（任意字串，用來混淆 QR token，避免可預測）

---

## API（MVP 五支）
- `POST /api/order/create`（Customer）
- `POST /api/route/create`（Admin）
- `POST /api/route/add-shipment`（Admin）
- `POST /api/shipment/scan`（Driver）
- `POST /api/shipment/proof`（Driver）

所有 API 都要求 `Authorization: Bearer <SUPABASE_JWT>`。

---

## 本機啟動（如果你要驗收）
```bash
cd web
npm i
cp .env.example .env.local
npm run dev
```

---

## 重要設計（你驗收時要看的）
- Shipment 狀態機被 DB trigger 鎖死：不能亂跳狀態
- Route 加入 shipment 後，自動把 shipment 狀態改為 `assigned`
- 每個 shipment 建立時自動產生 `qr_code`
- RLS 已啟用：客戶只能看自己的、司機只能看自己的 route shipments、Admin 全權
