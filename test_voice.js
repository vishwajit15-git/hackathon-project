const axios = require('axios');

async function testVoiceAlert() {
  try {
    // We need a token. We'll use the one from the admin we created earlier.
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'admin@smartcrowd.com',
      password: 'Admin@123'
    });
    const token = loginRes.data.token;

    const res = await axios.post('http://localhost:5000/api/voice/generate', {
      text: 'Test Alert: Please remain calm.',
      language: 'hi-IN'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Voice Alert Triggered:', res.data);
  } catch (err) {
    console.error('Test failed:', err.response?.data || err);
  }
}

testVoiceAlert();
