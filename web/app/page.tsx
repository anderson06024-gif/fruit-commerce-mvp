export default function Page() {
  return (
    <main>
      <h1 style={{ margin: 0 }}>Fruit Commerce MVP</h1>
      <p style={{ opacity: 0.8 }}>後端 + 履約核心已封裝。請用 API 進行驗收。</p>

      <h2>驗收要點</h2>
      <ol>
        <li>建立使用者（Supabase Auth）後，public.users 會自動產生 profile（預設 customer）。</li>
        <li>Customer 呼叫 /api/order/create → 會自動產生 order / order_items / shipment（含 qr_code）。</li>
        <li>Admin 建 route、加入 shipment → shipment 自動變 assigned（DB trigger）。</li>
        <li>Driver 使用 /api/shipment/scan（pickup/delivered）推進狀態，DB 會拒絕非法跳轉。</li>
      </ol>

      <h2>API 需要 Bearer Token</h2>
      <p style={{ opacity: 0.8 }}>
        所有 API 都要求 <code>Authorization: Bearer {"<JWT>"}</code>。
      </p>
    </main>
  );
}
