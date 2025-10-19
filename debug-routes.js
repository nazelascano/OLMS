// Debug script to test transaction routes  
const http = require('http');

function makeRequest(options, data) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed, headers: res.headers });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body, headers: res.headers });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function debugTransactionRoute() {
    try {
        // First login
        console.log('1. Logging in...');
        const loginResponse = await makeRequest({
            hostname: 'localhost',
            port: 5001,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        }, {
            usernameOrEmail: 'admin',
            password: 'admin123456'
        });

        if (loginResponse.status !== 200) {
            console.log('❌ Login failed:', loginResponse);
            return;
        }

        const token = loginResponse.data.token;
        console.log('✅ Login successful, token obtained');

        // Test basic transactions endpoint
        console.log('2. Testing GET /api/transactions...');
        const transactionsResponse = await makeRequest({
            hostname: 'localhost',
            port: 5001,
            path: '/api/transactions',
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('✅ Transactions endpoint accessible, status:', transactionsResponse.status);

        // Test borrow endpoint with detailed error
        console.log('3. Testing POST /api/transactions/borrow...');
        const borrowResponse = await makeRequest({
            hostname: 'localhost',
            port: 5001,
            path: '/api/transactions/borrow',
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }, {
            userId: 'mgg4voti2m1t0',
            items: [{
                copyId: '978-0123456789-MGG4VON8-ZZD4'
            }],
            type: 'regular',
            notes: 'Test borrow'
        });

        console.log('Borrow response status:', borrowResponse.status);
        console.log('Borrow response data:', borrowResponse.data);

    } catch (error) {
        console.error('Debug error:', error.message);
    }
}

debugTransactionRoute();