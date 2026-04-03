const axios = require('axios');

async function createAdmin() {
  try {
    const response = await axios.post('http://localhost:5000/api/auth/signup', {
      name: 'System Admin',
      email: 'admin@smartcrowd.com',
      password: 'Admin@123',
      phone: '9876543210',
      role: 'admin'
    });
    console.log('Admin account created successfully!');
    console.log('Login: admin@smartcrowd.com');
    console.log('Password: Admin@123');
  } catch (error) {
    if (error.response?.data?.message === 'Email already registered.') {
      console.log('Admin account already exists.');
    } else {
      console.error('Error creating admin:', error.response?.data || error.message);
    }
  }
}

createAdmin();
