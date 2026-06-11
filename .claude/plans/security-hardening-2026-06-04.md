# Plan 8: Security Hardening -- Detailed Implementation Plan

> **Priority**: P0
> **Estimated Effort**: 16h
> **Source**: Security audit 2026-06-04
> **Status**: Pending

---

## I. VibeContract

### Business Intent
As a **system administrator**, I want **comprehensive security protection** so that **the system resists brute force attacks, privilege escalation, token theft, and data leakage**.

### Data Contract

| Metric | Target | Current |
|--------|--------|---------|
| Token Storage | httpOnly Cookie | localStorage |
| CSP scriptSrc | nonce-based | unsafe-inline |
| Refresh Rate Limit | 10/min | None |
| Refresh Secret | Independent env var | JWT_SECRET + '_refresh' fallback |
| Logout Invalidation | Server-side blacklist | No-op |
| Input Validation | All write endpoints | Login only |
| Global Rate Limit | 200/min/IP | None |

### Boundary Contract
- **Token Security**: XSS cannot read tokens (httpOnly)
- **Rate Limiting**: Exceeding limits returns 429 without leaking account existence
- **Input Validation**: All user input passes express-validator before reaching DB

### Exception Contract

| Scenario | Status Code | Error Message |
|----------|-------------|---------------|
| Login rate limit | 429 | "Too many login attempts, please try later" |
| Refresh rate limit | 429 | "Too many refresh attempts" |
| Token expired | 401 | "Session expired, please login again" |
| Token blacklisted | 401 | "Session invalidated" |
| Insufficient permissions | 403 | "Access denied" |
| Invalid input | 400 | Chinese error messages per field |

### Acceptance Criteria
- [ ] Token stored in httpOnly Cookie (not readable via JS)
- [ ] CSP blocks inline script injection
- [ ] Refresh endpoint rate-limited at 10/min
- [ ] JWT_REFRESH_SECRET set as independent env var
- [ ] Logout invalidates token server-side
- [ ] All write endpoints have express-validator
- [ ] Global API rate limit at 200/min/IP

---

## II. Adversarial Prompts

### Boundary 1: XSS Token Theft via localStorage
**Risk**: Any XSS can steal tokens via `localStorage.getItem('token')`
**Test**: Inject `<script>` tag, verify token exfiltration is blocked after httpOnly migration

### Boundary 2: CSP Bypass with unsafe-inline
**Risk**: `scriptSrc: ['unsafe-inline']` allows injected scripts to execute
**Test**: Verify CSP header blocks inline scripts after tightening

### Boundary 3: Refresh Token Abuse
**Risk**: No rate limit on `/refresh` allows unlimited token generation
**Test**: Send 100 requests in 10 seconds, verify 429 response

### Boundary 4: Deterministic Refresh Secret
**Risk**: `JWT_SECRET + '_refresh'` is trivially derivable
**Test**: Verify `JWT_REFRESH_SECRET` env var is checked first

### Boundary 5: Token Valid After Logout
**Risk**: Logout returns success but token remains valid for 8 hours
**Test**: Logout then use same token to access protected endpoint

### Boundary 6: Input Validation Bypass
**Risk**: Only login has express-validator; all other endpoints accept raw input
**Test**: Send malformed data to inbound/outbound endpoints

---

## III. Task List

### Task 8.1: Migrate Tokens to httpOnly Cookie (5h)

**Files**: `auth.ts`, `request.ts`, `Login.tsx`, 4 cost pages

**Backend changes** (`auth.ts`):
```typescript
// Login response
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000,
})
res.cookie('refreshToken', refreshToken, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000,
})
// Still return user info in body, but NOT tokens
success(res, { expiresIn: 28800, user: { ... } })
```

**New endpoint** (`auth.ts`):
```typescript
router.get('/me', authenticateToken, (req, res) => {
  // Return current user info from JWT payload
})
```

**Frontend changes**:
- `request.ts`: Remove `localStorage.getItem('token')`, add `withCredentials: true` to axios config
- `Login.tsx`: Remove `localStorage.setItem('token')` and `localStorage.setItem('refreshToken')`
- `CostPoolList.tsx`, `CostDriverList.tsx`, `ActivityCenterList.tsx`, `ProfitabilityAnalysis.tsx`: Remove manual `localStorage.getItem('token')` header injection, use centralized axios instance

**Acceptance**:
- [ ] Browser dev tools cannot see token value
- [ ] `localStorage` has no token/refreshToken keys after login
- [ ] All API calls work with cookie-based auth

---

### Task 8.2: Set Independent JWT_REFRESH_SECRET (10min)

**File**: `后端代码/server/.env`

```env
JWT_REFRESH_SECRET=<generate-256-bit-random>
```

**Verification**: Check `auth.ts:12` log shows `process.env.JWT_REFRESH_SECRET` is used (not fallback).

**Acceptance**:
- [ ] `.env` contains `JWT_REFRESH_SECRET`
- [ ] Server starts without error

---

### Task 8.3: Add Rate Limiting to /refresh (15min)

**File**: `auth.ts`

```typescript
const refreshLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: { message: 'Too many refresh attempts', code: 'RATE_LIMIT' } },
})

router.post('/refresh', refreshLimiter, (req, res) => { ... })
```

**Acceptance**:
- [ ] 11+ refresh requests in 1 minute return 429

---

### Task 8.4: Tighten CSP (30min)

**File**: `app.ts`

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],  // Remove 'unsafe-inline'
      styleSrc: ["'self'", "'unsafe-inline'"],  // Keep for Tailwind
      imgSrc: ["'self'", "data:"],
    },
  },
}))
```

**Acceptance**:
- [ ] Response header `Content-Security-Policy` does not contain `unsafe-inline` for scriptSrc
- [ ] Frontend loads and functions correctly
- [ ] Injected `<script>` tags are blocked by browser

---

### Task 8.5: Add express-validator to Write Endpoints (4h)

**Priority endpoints**:

| File | Endpoint | Validation |
|------|----------|------------|
| `users-v1.1.ts` | POST / | username, password, role required |
| `inbound-v1.1.ts` | POST / | materialId, quantity > 0 required |
| `outbound-v1.1.ts` | POST / | materialId, quantity > 0 required |
| `bom-v1.1.ts` | POST / | name required, materials array validated |

**Pattern**:
```typescript
import { body, validationResult } from 'express-validator'

router.post('/',
  body('materialId').notEmpty().withMessage('Material ID required'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('Quantity must be positive'),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return error(res, errors.array().map(e => e.msg).join(', '), 'INVALID_PARAMETER', 400)
    }
    // ... existing logic
  }
)
```

**Acceptance**:
- [ ] POST with missing required fields returns 400
- [ ] POST with invalid types returns 400
- [ ] Error messages are in Chinese

---

### Task 8.6: Implement Token Blacklist for Logout (3h)

**Files**: `DatabaseManager.ts`, `auth.ts`, `middleware/auth.ts`

**Database**:
```sql
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti TEXT PRIMARY KEY,
  expires_at DATETIME NOT NULL
)
CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist(expires_at)
```

**auth.ts** -- Logout:
```typescript
router.post('/logout', authenticateToken, (req, res) => {
  const db = getDatabase()
  const jti = req.user.jti || `${req.user.userId}-${Date.now()}`
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT OR IGNORE INTO token_blacklist (jti, expires_at) VALUES (?, ?)').run(jti, expiresAt)
  res.clearCookie('token')
  res.clearCookie('refreshToken')
  success(res, null, 'Logout success')
})
```

**middleware/auth.ts** -- Check blacklist:
```typescript
// After jwt.verify succeeds
const db = getDatabase()
const blacklisted = db.prepare('SELECT 1 FROM token_blacklist WHERE jti = ?').get(decoded.jti)
if (blacklisted) {
  return res.status(401).json({ success: false, error: { message: 'Session invalidated', code: 'UNAUTHORIZED' } })
}
```

**Cleanup**: Periodic deletion of expired entries.

**Acceptance**:
- [ ] After logout, same token returns 401
- [ ] Expired blacklist entries are cleaned up

---

### Task 8.7: Global API Rate Limiting (30min)

**File**: `app.ts`

```typescript
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/v1', globalLimiter)
```

**Acceptance**:
- [ ] 201+ requests in 1 minute return 429
- [ ] Login limiter (5/min) still takes precedence for `/login`

---

## IV. Impact Assessment

### Files Modified

| File | Changes | Risk |
|------|---------|------|
| `auth.ts` | Cookie auth, refresh limiter, logout blacklist | High |
| `middleware/auth.ts` | Blacklist check | Medium |
| `app.ts` | CSP tightening, global rate limit | Low |
| `request.ts` | withCredentials, remove localStorage | High |
| `Login.tsx` | Remove localStorage usage | Medium |
| `CostPoolList.tsx` | Use centralized axios | Low |
| `CostDriverList.tsx` | Use centralized axios | Low |
| `ActivityCenterList.tsx` | Use centralized axios | Low |
| `ProfitabilityAnalysis.tsx` | Use centralized axios | Low |
| `DatabaseManager.ts` | token_blacklist table | Low |
| `users-v1.1.ts` | express-validator | Low |
| `inbound-v1.1.ts` | express-validator | Low |
| `outbound-v1.1.ts` | express-validator | Low |
| `bom-v1.1.ts` | express-validator | Low |

### Rollback Plan

| Task | Rollback | Impact |
|------|----------|--------|
| 8.1 Token migration | Revert to localStorage | Restore XSS risk |
| 8.2 Refresh secret | Remove env var | Restore fallback |
| 8.3 Refresh limiter | Remove middleware | Restore unlimited refresh |
| 8.4 CSP | Restore unsafe-inline | Restore XSS CSP bypass |
| 8.5 Input validation | Remove validators | Restore raw input acceptance |
| 8.6 Token blacklist | Drop table, restore no-op logout | Restore post-logout token validity |
| 8.7 Global rate limit | Remove middleware | Restore unlimited API access |

---

## V. PM Black-box Acceptance Checklist

- [ ] Login 5 times with wrong password -> account locked 15 minutes
- [ ] Browser dev tools -> Token value not visible (httpOnly)
- [ ] Inject `<script>` in any input -> CSP blocks execution
- [ ] Call /refresh 11 times in 1 minute -> 429 response
- [ ] Logout then use same token -> 401 response
- [ ] Send empty username to POST /users -> 400 with Chinese error
- [ ] Send 201 requests in 1 minute -> 429 global rate limit

---

## VI. Test Scenarios

| # | Scenario | Expected | Priority |
|---|----------|----------|----------|
| 1 | XSS token theft | Blocked (httpOnly) | P0 |
| 2 | Login brute force | 429 after 5 attempts | P0 |
| 3 | Refresh brute force | 429 after 10 attempts | P0 |
| 4 | Token after logout | 401 | P0 |
| 5 | Forged refresh token | Fails (independent secret) | P0 |
| 6 | CSP inline script | Blocked | P1 |
| 7 | Malformed inbound data | 400 validation error | P1 |
| 8 | Global rate limit | 429 after 200 requests | P2 |
| 9 | Role escalation (technician -> admin routes) | 403 | P0 |
| 10 | SQL injection via search | Blocked (parameterized) | P0 |

---

*Plan created: 2026-06-04*
*Security audit by: Claude security-reviewer agent*
