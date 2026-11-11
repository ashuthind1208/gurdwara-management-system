const apiBaseUrl = String(process.env.API_BASE_URL || 'http://127.0.0.1:4242/api').replace(/\/$/, '');

const gurdwaraImage = '/api/uploads/cms/2026/07/1783711144877-te3vsx-milton_about_us.webp';

const events = [
  {
    title: 'Sunday Asa Di Vaar and Family Diwan',
    description: 'Join the sangat for Asa Di Vaar, Sukhmani Sahib, Shabad Kirtan, Katha, Ardaas, and Guru Ka Langar. Families and first-time visitors are welcome.',
    date: '2026-08-02T08:30:00-04:00',
    endDate: '2026-08-02T13:30:00-04:00',
    location: 'Main Diwan Hall, Gurdwara',
    category: 'Paath',
    mediaUrl: gurdwaraImage,
    capacity: 250,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  },
  {
    title: 'New Family Welcome and Gurdwara Tour',
    description: 'A friendly orientation for families new to the Milton sangat, including a Gurdwara tour, program overview, membership guidance, and time for questions.',
    date: '2026-08-02T14:00:00-04:00',
    endDate: '2026-08-02T15:00:00-04:00',
    location: 'Community Room, Gurdwara',
    category: 'Workshop',
    mediaUrl: gurdwaraImage,
    capacity: 40,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  },
  {
    title: 'Kids Gurmat Program Open House',
    description: 'Parents and children can meet the Gurmat teachers, review the fall learning plan, see classroom activities, and ask questions about registration.',
    date: '2026-08-02T15:15:00-04:00',
    endDate: '2026-08-02T16:30:00-04:00',
    location: 'Gurmat Classrooms, Gurdwara',
    category: 'Workshop',
    mediaUrl: gurdwaraImage,
    capacity: 60,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  },
  {
    title: 'Youth Kirtan and Tabla Practice',
    description: 'A guided practice session for youth preparing shabads for the next Sunday program. Beginner harmonium and tabla learners may attend.',
    date: '2026-08-05T18:30:00-04:00',
    endDate: '2026-08-05T20:00:00-04:00',
    location: 'Lower Hall, Gurdwara',
    category: 'Workshop',
    mediaUrl: gurdwaraImage,
    capacity: 30,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  },
  {
    title: 'Seniors Wellness and Digital Safety Clinic',
    description: 'Community volunteers will offer basic wellness checks and practical guidance for recognizing phone, email, and banking scams. This is an educational session, not medical care.',
    date: '2026-08-06T10:00:00-04:00',
    endDate: '2026-08-06T12:00:00-04:00',
    location: 'Community Room, Gurdwara',
    category: 'Workshop',
    mediaUrl: gurdwaraImage,
    capacity: 35,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  },
  {
    title: 'Milton Community Food Drive Collection Day',
    description: 'Bring unopened non-perishable food and hygiene items for local families. Volunteers will receive, sort, label, and prepare donations for community partners.',
    date: '2026-08-08T09:00:00-04:00',
    endDate: '2026-08-08T13:00:00-04:00',
    location: 'Front Entrance and Langar Hall, Gurdwara',
    category: 'Seva',
    mediaUrl: gurdwaraImage,
    capacity: 80,
    waitlistEnabled: true,
    registrations: 0,
    active: true
  }
];

const sevaOpportunities = [
  {
    sevaType: 'Sunday Langar Preparation Team',
    date: '2026-08-02T04:00:00.000Z',
    time: '7:00 AM - 10:30 AM',
    totalVolunteersRequired: 12,
    expiryDate: '2026-08-02T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  },
  {
    sevaType: 'Sunday Langar Serving and Dish Area',
    date: '2026-08-02T04:00:00.000Z',
    time: '11:00 AM - 2:30 PM',
    totalVolunteersRequired: 16,
    expiryDate: '2026-08-02T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  },
  {
    sevaType: 'Sunday Parking and Welcome Desk',
    date: '2026-08-02T04:00:00.000Z',
    time: '8:30 AM - 1:30 PM',
    totalVolunteersRequired: 8,
    expiryDate: '2026-08-02T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  },
  {
    sevaType: 'Gurmat Classroom Setup and Family Check-in',
    date: '2026-08-02T04:00:00.000Z',
    time: '1:30 PM - 4:30 PM',
    totalVolunteersRequired: 6,
    expiryDate: '2026-08-02T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  },
  {
    sevaType: 'Seniors Clinic Welcome and Accessibility Support',
    date: '2026-08-06T04:00:00.000Z',
    time: '9:30 AM - 12:30 PM',
    totalVolunteersRequired: 4,
    expiryDate: '2026-08-06T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  },
  {
    sevaType: 'Food Drive Sorting and Vehicle Loading',
    date: '2026-08-08T04:00:00.000Z',
    time: '8:30 AM - 2:00 PM',
    totalVolunteersRequired: 10,
    expiryDate: '2026-08-08T04:00:00.000Z',
    waitlistEnabled: true,
    active: true
  }
];

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${body.message || 'Unknown API error'}`);
  }
  return body.data;
};

const seedMissing = async ({ currentRows, fixtures, identity, path }) => {
  const existingKeys = new Set(currentRows.map((row) => String(row?.[identity] || '').trim().toLowerCase()));
  let created = 0;
  let skipped = 0;

  for (const fixture of fixtures) {
    const key = String(fixture[identity] || '').trim().toLowerCase();
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }

    await requestJson(path, {
      method: 'POST',
      body: JSON.stringify(fixture)
    });
    existingKeys.add(key);
    created += 1;
  }

  return { created, skipped };
};

const currentEvents = await requestJson('/events');
const currentSeva = await requestJson('/content/seva_opportunities');

const eventResult = await seedMissing({
  currentRows: currentEvents,
  fixtures: events,
  identity: 'title',
  path: '/events'
});

const sevaResult = await seedMissing({
  currentRows: currentSeva,
  fixtures: sevaOpportunities,
  identity: 'sevaType',
  path: '/content/seva_opportunities'
});

console.log(`Events: ${eventResult.created} created, ${eventResult.skipped} already present.`);
console.log(`Seva opportunities: ${sevaResult.created} created, ${sevaResult.skipped} already present.`);