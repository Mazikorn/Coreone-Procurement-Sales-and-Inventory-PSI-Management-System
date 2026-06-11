async function apiLogin() {
  const res = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' }),
  });
  const data = await res.json();
  return data.data?.token || data.token;
}

async function apiFetch(token, method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`http://127.0.0.1:3001/api/v1${path}`, opts);
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function main() {
  const token = await apiLogin();
  
  const mats = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1');
  const mid = mats.data?.data?.list?.[0]?.id;
  console.log('Material:', mid);
  
  // Check stock
  const inv = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`);
  console.log('Inventory:', JSON.stringify(inv.data?.data?.list?.[0]));
  
  // Seed stock
  const lidRes = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1');
  const lid = lidRes.data?.data?.list?.[0]?.id;
  console.log('Location:', lid);
  
  const seedRes = await apiFetch(token, 'POST', '/inbound', {
    type: 'purchase', materialId: mid, quantity: 20,
    locationId: lid, remark: 'E2E stock seed',
  });
  console.log('Seed inbound status:', seedRes.status, 'data:', JSON.stringify(seedRes.data));
  
  // Check stock after seed
  const inv2 = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`);
  console.log('Inventory after seed:', JSON.stringify(inv2.data?.data?.list?.[0]));
  
  // Concurrent test
  const projs = await apiFetch(token, 'GET', '/projects?page=1&pageSize=1');
  const pid = projs.data?.data?.list?.[0]?.id;
  const body = { type: 'project', projectId: pid, items: [{ materialId: mid, quantity: 1 }], remark: 'E2E并发' };
  const [r1, r2] = await Promise.all([
    apiFetch(token, 'POST', '/outbound', body),
    apiFetch(token, 'POST', '/outbound', body)
  ]);
  console.log('R1:', r1.status, JSON.stringify(r1.data));
  console.log('R2:', r2.status, JSON.stringify(r2.data));
}

main().catch(console.error);
