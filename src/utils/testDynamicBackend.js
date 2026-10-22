const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE = 'http://localhost:5001';

const runTests = async () => {
  console.log('=== STARTING COMPLETE DYNAMIC BACKEND VERIFICATION ===\n');

  let passed = 0;
  let total = 0;

  const assertTest = (name, condition, extra = '') => {
    total++;
    if (condition) {
      console.log(`[PASS] ${name} ${extra}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name} ${extra}`);
    }
  };

  // 1. Dynamic OTP Generation
  console.log('1. Testing Dynamic OTP Generation...');
  const testPhone = '+919876599999';
  const otpRes = await fetch(`${BASE}/api/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone }),
  });
  const otpData = await otpRes.json();
  const generatedOtp = otpData.otpCode;
  assertTest('Dynamic OTP Request', otpData.success && generatedOtp && generatedOtp.length === 6, `(Code: ${generatedOtp})`);

  // 2. Dynamic OTP Verification using the freshly generated code
  console.log('2. Testing OTP Verification with generated dynamic code...');
  const verifyRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, otp: generatedOtp, role: 'farmer', name: 'Kuldeep Singh' }),
  });
  const verifyData = await verifyRes.json();
  const farmerToken = verifyData.token;
  assertTest('Dynamic OTP Verification', verifyData.success && farmerToken, `(User ID: ${verifyData.user?._id})`);

  // 3. Test Reusing the same OTP (should fail because isUsed is true)
  const reuseRes = await fetch(`${BASE}/api/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: testPhone, otp: generatedOtp, role: 'farmer' }),
  });
  const reuseData = await reuseRes.json();
  assertTest('Used OTP Rejection', !reuseData.success, '(Correctly rejected expired/used OTP)');

  // 4. Test Farmer Home Feed (Live weather, active booking, categories, promotions)
  console.log('3. Testing Farmer Home Dashboard Feed...');
  const feedRes = await fetch(`${BASE}/api/farmers/home-feed`, {
    headers: { Authorization: `Bearer ${farmerToken}` },
  });
  const feedData = await feedRes.json();
  assertTest(
    'Farmer Home Feed Aggregation',
    feedData.success && feedData.data?.farmer?.name === 'Kuldeep Singh' && feedData.data?.categories?.length > 0,
    `(Categories: ${feedData.data?.categories?.length}, Featured: ${feedData.data?.featuredServices?.length})`
  );

  // 5. Test Agent Login and Dashboard
  console.log('4. Testing Agent Operations...');
  const agentLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: '+919876543211', password: 'Password@123' }),
  });
  const agentLogin = await agentLoginRes.json();
  const agentToken = agentLogin.token;
  assertTest('Agent Login', agentLogin.success && agentToken);

  // 6. Test Agent Villages and Farmers
  const villagesRes = await fetch(`${BASE}/api/agents/villages`, {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  const villagesData = await villagesRes.json();
  const cluster = villagesData.coverageClusters?.[0];
  assertTest('Agent Coverage Clusters', villagesData.success && cluster, `(Cluster: ${cluster?.villageName})`);

  if (cluster) {
    const clusterFarmersRes = await fetch(`${BASE}/api/agents/villages/${cluster._id}/farmers`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const clusterFarmers = await clusterFarmersRes.json();
    assertTest('Agent Cluster Farmers Directory', clusterFarmers.success && Array.isArray(clusterFarmers.farmers));
  }

  // 7. Test Agent Detailed Farmer View
  const farmersListRes = await fetch(`${BASE}/api/agents/farmers`, {
    headers: { Authorization: `Bearer ${agentToken}` },
  });
  const farmersListData = await farmersListRes.json();
  const firstFarmer = farmersListData.farmers?.[0];
  if (firstFarmer) {
    const farmerDetailRes = await fetch(`${BASE}/api/agents/farmers/${firstFarmer._id}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    });
    const farmerDetail = await farmerDetailRes.json();
    assertTest(
      'Agent Detailed Farmer Ledger',
      farmerDetail.success && farmerDetail.data?.name === firstFarmer.name,
      `(Farmer: ${farmerDetail.data?.name}, Bookings: ${farmerDetail.data?.bookingsCount})`
    );
  }

  // 8. Test Dynamic Payment Gateway Order Creation
  console.log('5. Testing Payment Order & Escrow Locking...');
  // Find a booking
  const bookingsRes = await fetch(`${BASE}/api/farmers/bookings`, {
    headers: { Authorization: `Bearer ${agentToken}` }, // or admin
  });
  const adminLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'admin@profarmer.com', password: 'Admin@123456' }),
  });
  const adminLogin = await adminLoginRes.json();
  const adminToken = adminLogin.token;

  const adminBookingsRes = await fetch(`${BASE}/api/admin/bookings`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminBookings = await adminBookingsRes.json();
  const sampleBooking = adminBookings.bookings?.[0];

  if (sampleBooking) {
    const orderRes = await fetch(`${BASE}/api/bookings/${sampleBooking._id}/payment/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ gateway: 'upi' }),
    });
    const orderData = await orderRes.json();
    assertTest('Payment Gateway Order Creation', orderData.success && orderData.order?.orderId, `(Order ID: ${orderData.order?.orderId})`);

    const verifyPayRes = await fetch(`${BASE}/api/bookings/${sampleBooking._id}/payment/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ paymentId: `PAY_UPI_${Date.now()}`, method: 'upi_intent' }),
    });
    const verifyPayData = await verifyPayRes.json();
    assertTest('Escrow Lock Verification', verifyPayData.success && verifyPayData.booking?.payment?.status === 'escrow_locked');
  }

  // 9. Test Verified KYC PDF Document URLs
  console.log('6. Testing Verified Official KYC PDFs...');
  const samplePdfs = ['sample_aadhaar.pdf', 'sample_land_record.pdf', 'sample_rc.pdf', 'sample_dl.pdf'];
  for (const pdfName of samplePdfs) {
    const pdfRes = await fetch(`${BASE}/uploads/${pdfName}`);
    assertTest(`Static Verified KYC PDF [${pdfName}]`, pdfRes.status === 200 && pdfRes.headers.get('content-type')?.includes('pdf'));
  }

  console.log(`\n=== RESULTS: ${passed} / ${total} TESTS PASSED ===\n`);
  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
};

runTests().catch((err) => {
  console.error('[DynamicTest] Unexpected error:', err);
  process.exit(1);
});
