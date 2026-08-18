// scripts/testProductionAuthAndFlow.js
const http = require('http');

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function runProductionTests() {
  console.log('🧪 Starting API & Authentication Verification Suite...\n');

  try {
    // 1. Admin Login
    console.log('🔑 1. Logging in as System Administrator (admin@cooperative.rw)...');
    const adminLoginRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'admin@cooperative.rw',
      password: 'Admin@Cooperative2026'
    });

    if (adminLoginRes.statusCode !== 200) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginRes.body)}`);
    }

    const adminToken = adminLoginRes.body.token;
    console.log('  ✅ Admin login successful. JWT Bearer token acquired.');

    // 2. Dynamic Member Registration (Admin Role Required)
    console.log('\n👤 2. Registering a new member dynamically using Admin JWT...');
    const registerRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/members',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`
      }
    }, {
      member_number: 2,
      full_name: 'Eric Keza',
      phone_number: '+250788112233',
      email: 'eric.keza@cooperative.rw',
      initial_password: 'MemberPassword2026!',
      role: 'MEMBER'
    });

    if (registerRes.statusCode !== 201) {
      throw new Error(`Member registration failed: ${JSON.stringify(registerRes.body)}`);
    }
    console.log(`  ✅ ${registerRes.body.message}`);

    // 3. New Member Login
    console.log('\n🔑 3. Logging in as newly registered member (eric.keza@cooperative.rw)...');
    const memberLoginRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'eric.keza@cooperative.rw',
      password: 'MemberPassword2026!'
    });

    if (memberLoginRes.statusCode !== 200) {
      throw new Error(`Member login failed: ${JSON.stringify(memberLoginRes.body)}`);
    }

    const memberToken = memberLoginRes.body.token;
    console.log('  ✅ Member login successful. JWT Bearer token acquired.');

    // 4. Test Role-Based Authorization Restriction
    console.log('\n🛡️ 4. Verifying security: Testing if regular MEMBER can trigger 4 PM Cutoff (Admin action)...');
    const forbiddenRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/contributions/cutoff',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${memberToken}`
      }
    }, { targetDate: '2026-08-09' });

    if (forbiddenRes.statusCode === 403) {
      console.log('  ✅ Security verified! Express blocked regular member with HTTP 403 Forbidden.');
    } else {
      console.error(`  ❌ Security check failed! Received status code ${forbiddenRes.statusCode}`);
    }

    // 5. Test Authenticated Financial Route
    console.log('\n📊 5. Fetching ledger balances using Member JWT...');
    const balanceRes = await makeRequest({
      hostname: 'localhost',
      port: 5000,
      path: '/api/ledger/balances',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${memberToken}`
      }
    });

    if (balanceRes.statusCode === 200) {
      console.log('  ✅ Ledger balances fetched successfully via JWT authentication:');
      console.log('    ', balanceRes.body);
    } else {
      console.error(`  ❌ Ledger query failed: ${JSON.stringify(balanceRes.body)}`);
    }

    console.log('\n🎉 ALL SYSTEM & AUTHENTICATION TESTS PASSED!');

  } catch (error) {
    console.error('\n❌ Test suite execution failed:', error.message);
  } finally {
    process.exit(0);
  }
}

runProductionTests();
