// utils/seedData.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load environment variables
dotenv.config();

const seedUsers = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Clear existing users (optional - uncomment if you want fresh start)
    // await User.deleteMany({});
    // console.log('🗑️  Cleared existing users');

    // Check if users already exist
    const existingUsers = await User.find({});
    if (existingUsers.length > 0) {
      console.log('📋 Users already exist in database:');
      existingUsers.forEach(user => {
        console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
      });
      console.log('\n💡 You can use these credentials to login');
      process.exit(0);
    }

    // Create test users
    const testUsers = [
      {
        name: 'John Freelancer',
        email: 'freelancer@test.com',
        password: 'password123',
        role: 'freelancer',
        profile: {
          skills: ['JavaScript', 'React', 'Node.js', 'MongoDB'],
          hourlyRate: 50,
          bio: 'Full-stack developer with 5+ years experience in web development. Specialized in React and Node.js applications.',
          location: 'New York, USA',
          availability: 'available'
        },
        isVerified: true
      },
      {
        name: 'Jane Client',
        email: 'client@test.com',
        password: 'password123',
        role: 'client',
        profile: {
          company: 'TechStartup Inc',
          industry: 'Technology',
          companySize: '11-50',
          location: 'San Francisco, USA',
          website: 'https://techstartup.com'
        },
        isVerified: true
      },
      {
        name: 'Admin User',
        email: 'admin@test.com',
        password: 'password123',
        role: 'admin',
        profile: {
          location: 'Remote'
        },
        isVerified: true
      },
      {
        name: 'Sarah Designer',
        email: 'designer@test.com',
        password: 'password123',
        role: 'freelancer',
        profile: {
          skills: ['UI/UX Design', 'Figma', 'Adobe Creative Suite', 'Prototyping'],
          hourlyRate: 45,
          bio: 'Creative UI/UX designer passionate about creating beautiful and functional user experiences.',
          location: 'London, UK',
          availability: 'available'
        },
        ratings: {
          average: 4.8,
          count: 12
        },
        isVerified: true
      },
      {
        name: 'Mike Developer',
        email: 'developer@test.com',
        password: 'password123',
        role: 'freelancer',
        profile: {
          skills: ['Python', 'Django', 'PostgreSQL', 'AWS'],
          hourlyRate: 60,
          bio: 'Backend developer specializing in Python and cloud infrastructure. Love building scalable systems.',
          location: 'Toronto, Canada',
          availability: 'busy'
        },
        ratings: {
          average: 4.9,
          count: 8
        },
        isVerified: true
      },
      {
        name: 'Enterprise Corp',
        email: 'enterprise@test.com',
        password: 'password123',
        role: 'client',
        profile: {
          company: 'Enterprise Corp',
          industry: 'Finance',
          companySize: '500+',
          location: 'Chicago, USA',
          website: 'https://enterprise-corp.com'
        },
        isVerified: true
      }
    ];

    // Insert users
    const createdUsers = await User.create(testUsers);
    console.log('✅ Successfully created test users:');
    console.log('\n🔑 LOGIN CREDENTIALS:');
    console.log('==========================================');
    
    createdUsers.forEach(user => {
      console.log(`👤 ${user.role.toUpperCase()}: ${user.name}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   🔒 Password: password123`);
      console.log('');
    });

    console.log('💡 All users have the same password: password123');
    console.log('🚀 You can now use these credentials to login!');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('📪 Database connection closed');
    process.exit(0);
  }
};

// Run seeder
seedUsers();