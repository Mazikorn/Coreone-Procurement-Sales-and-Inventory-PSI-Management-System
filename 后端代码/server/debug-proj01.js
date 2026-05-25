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
  const projs = await apiFetch(token, 'GET', '/projects?page=1&pageSize=1');
  const pid = projs.data?.data?.list?.[0]?.id;
  const res = await apiFetch(token, 'POST', '/outbound', {
    type: 'project', projectId: pid, items: [{ materialId: mid, quantity: 1 }], remark: 'E2E项目领用',
  });
  console.log('Status:', res.status);
  console.log('Data:', JSON.stringify(res.data));
}

main().catch(console.error);
