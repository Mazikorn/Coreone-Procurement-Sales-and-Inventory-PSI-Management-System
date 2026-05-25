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
  
  // Get first material and project
  const mats = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1');
  const mid = mats.data?.data?.list?.[0]?.id;
  const projs = await apiFetch(token, 'GET', '/projects?page=1&pageSize=1');
  const pid = projs.data?.data?.list?.[0]?.id;
  
  console.log('Material:', mid);
  console.log('Project:', pid);
  
  // Check inventory
  const inv = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`);
  console.log('Inventory:', JSON.stringify(inv.data?.data?.list?.[0]));
  
  // Test concurrent requests
  const body = { type: 'project', projectId: pid, items: [{ materialId: mid, quantity: 1 }], remark: 'DEBUG' };
  const [r1, r2] = await Promise.all([
    apiFetch(token, 'POST', '/outbound', body),
    apiFetch(token, 'POST', '/outbound', body)
  ]);
  
  console.log('R1 status:', r1.status, 'data:', JSON.stringify(r1.data));
  console.log('R2 status:', r2.status, 'data:', JSON.stringify(r2.data));
}

main().catch(console.error);
