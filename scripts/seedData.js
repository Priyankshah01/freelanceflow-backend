// scripts/seedData.js
//
// Creates the demo accounts and a few sample jobs. Safe to run more than once:
// it only adds what is missing.
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Project = require('../models/Project');

// Load environment variables
dotenv.config();

const seedUsers = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

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

    // Insert only the users that don't exist yet (matched by email)
    let created = 0;
    for (const data of testUsers) {
      const exists = await User.exists({ email: data.email });
      if (exists) continue;
      await User.create(data); // create() runs the password-hashing hook
      created += 1;
    }
    console.log(`👤 Users: ${created} created, ${testUsers.length - created} already existed`);

    // Sample open jobs so the job board isn't empty in the demo
    const clients = await User.find({ email: { $in: ['client@test.com', 'enterprise@test.com'] } });
    const [client, enterprise = client] = clients;
    if (client && !(await Project.exists({ client: { $in: clients.map((c) => c._id) } }))) {
      await Project.create([
        {
          title: 'Redesign onboarding flow for a fintech app',
          description: 'We need a UX designer to audit our 6-step mobile onboarding and design a shorter flow in Figma, with a clickable prototype and handoff notes.',
          client: client._id,
          category: 'ui-ux-design',
          skills: ['Figma', 'UX Research', 'Prototyping'],
          budget: { type: 'fixed', amount: 2500 },
          timeline: { duration: '1-3-months' },
          experienceLevel: 'intermediate',
          projectSize: 'medium',
          isRemote: true,
        },
        {
          title: 'Build a React dashboard for sales analytics',
          description: 'Looking for a front-end developer to build a responsive dashboard with charts, filters and CSV export on top of our existing REST API.',
          client: enterprise._id,
          category: 'web-development',
          skills: ['React', 'Tailwind CSS', 'Chart.js'],
          budget: { type: 'hourly', hourlyRate: { min: 40, max: 65 } },
          timeline: { duration: '1-3-months' },
          experienceLevel: 'expert',
          projectSize: 'large',
          isRemote: true,
        },
        {
          title: 'Logo and brand kit for a coffee roastery',
          description: 'Small local roastery needs a logo, colour palette and simple brand guidelines for packaging and social media.',
          client: client._id,
          category: 'graphic-design',
          skills: ['Branding', 'Illustrator', 'Logo Design'],
          budget: { type: 'fixed', amount: 800 },
          timeline: { duration: 'less-than-1-month' },
          experienceLevel: 'entry',
          projectSize: 'small',
          isRemote: true,
        },
        {
          title: 'Write 8 SEO blog posts about remote work',
          description: 'We need well-researched 1,200-word articles on remote-work tools and habits, optimized for search and written in a friendly tone.',
          client: enterprise._id,
          category: 'content-writing',
          skills: ['SEO', 'Copywriting', 'Research'],
          budget: { type: 'fixed', amount: 960 },
          timeline: { duration: 'less-than-1-month' },
          experienceLevel: 'intermediate',
          projectSize: 'small',
          isRemote: true,
        },
      ]);
      console.log('📁 Created 4 sample open jobs');
    } else {
      console.log('📁 Sample jobs already exist (or no demo client found); skipped');
    }

    console.log('\n🔑 Demo logins (password for all: password123):');
    testUsers.forEach((u) => console.log(`   ${u.role.padEnd(10)} ${u.email}`));

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