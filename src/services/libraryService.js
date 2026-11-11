import { serviceResponse } from './serviceResponse';
import contentApiService from './contentApiService';
import eventService from './eventService';

const STORAGE_RESOURCE = 'library_content';

const defaultLibraryData = {
  physicalBooks: [
    {
      id: 'book-1',
      title: 'Japji Sahib Steek',
      author: 'Prof. Sahib Singh',
      category: 'Gurbani',
      isbn: '9780000000001',
      totalCopies: 6,
      issueRecords: [
        {
          id: 'issue-1',
          copyNumber: 1,
          issuerName: 'Amritpal Singh',
          issuerPhone: '+1 647-100-2001',
          issueDate: '2026-07-03',
          returnDate: '2026-07-14',
          returnedAt: ''
        },
        {
          id: 'issue-2',
          copyNumber: 3,
          issuerName: 'Harleen Kaur',
          issuerPhone: '+1 647-100-2002',
          issueDate: '2026-07-06',
          returnDate: '2026-07-17',
          returnedAt: ''
        }
      ],
      notes: 'Punjabi commentary edition.',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'book-2',
      title: 'A History of the Sikhs',
      author: 'Khushwant Singh',
      category: 'History',
      isbn: '9780000000002',
      totalCopies: 4,
      issueRecords: [
        {
          id: 'issue-3',
          copyNumber: 2,
          issuerName: 'Jasleen Kaur',
          issuerPhone: '+1 647-100-2003',
          issueDate: '2026-07-04',
          returnDate: '2026-07-13',
          returnedAt: ''
        }
      ],
      notes: 'Volume set available in reference corner.',
      updatedAt: new Date().toISOString()
    }
  ],
  digitalResources: [
    {
      id: 'digital-1',
      title: 'Nitnem Gutka PDF',
      fileType: 'PDF',
      description: 'Daily banis in one downloadable document.',
      downloadUrl: 'https://example.com/nitnem-gutka.pdf',
      coverImageUrl: 'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=320&q=80',
      tags: 'nitnem, paath',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'digital-2',
      title: 'Sikh Rehat Maryada Notes',
      fileType: 'DOC',
      description: 'Community study notes and class material.',
      downloadUrl: 'https://example.com/rehat-maryada.docx',
      coverImageUrl: 'https://images.unsplash.com/photo-1455885666463-9a367d1d6740?auto=format&fit=crop&w=320&q=80',
      tags: 'rehat, study',
      updatedAt: new Date().toISOString()
    }
  ],
  programUpdates: [
    {
      id: 'session-1',
      title: 'Author Spotlight: Sikh History in Modern Times',
      speaker: 'Dr. Ravinder Singh',
      audience: 'Teens and Adults',
      scheduleDate: '2026-07-21',
      scheduleTime: '6:30 PM',
      location: 'Gurdwara Library',
      summary: 'Interactive reading and Q&A on Sikh history sources and storytelling methods.',
      registrationUrl: '/events',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'session-2',
      title: 'Kids Reading Circle: Stories of the Sahibzade',
      speaker: 'Bibi Simran Kaur',
      audience: 'Kids (Ages 6-12)',
      scheduleDate: '2026-07-27',
      scheduleTime: '11:00 AM',
      location: 'Children Corner, Library Wing',
      summary: 'Story session, vocabulary games, and gentle introduction to Sikh values for children.',
      registrationUrl: '/events',
      updatedAt: new Date().toISOString()
    }
  ],
  mediaResources: [
    {
      id: 'media-res-1',
      title: 'Japji Sahib Katha — Full Explanation',
      mediaType: 'youtube',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      description: 'Complete katha and meaning of Japji Sahib by Giani Ji.',
      thumbnailUrl: '',
      tags: 'japji, katha, gurbani',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'media-res-2',
      title: 'Introduction to Sikhism — Audio Series',
      mediaType: 'audio',
      url: 'https://example.com/sikhism-intro.mp3',
      description: 'Audio series covering basics of Sikh faith for new learners.',
      thumbnailUrl: '',
      tags: 'sikhism, beginner, audio',
      updatedAt: new Date().toISOString()
    }
  ]
};

const normalizeCount = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
};

const normalizeIssueRecord = (record = {}, index = 0) => ({
  id: record.id || `issue-${Date.now()}-${index}`,
  copyNumber: Math.max(1, normalizeCount(record.copyNumber) || 1),
  issuerName: record.issuerName || '',
  issuerPhone: record.issuerPhone || '',
  issueDate: record.issueDate || new Date().toISOString().slice(0, 10),
  returnDate: record.returnDate || '',
  returnedAt: record.returnedAt || ''
});

const normalizeMediaResource = (entry = {}, index = 0) => ({
  id: entry.id || `media-res-${Date.now()}-${index}`,
  title: entry.title || '',
  mediaType: entry.mediaType || 'youtube',
  url: entry.url || '',
  description: entry.description || '',
  thumbnailUrl: entry.thumbnailUrl || '',
  tags: entry.tags || '',
  updatedAt: entry.updatedAt || new Date().toISOString()
});

const normalizeProgramUpdate = (entry = {}, index = 0) => ({
  id: entry.id || `session-${Date.now()}-${index}`,
  title: entry.title || '',
  speaker: entry.speaker || '',
  audience: entry.audience || '',
  scheduleDate: entry.scheduleDate || '',
  scheduleStartTime: entry.scheduleStartTime || '',
  scheduleEndTime: entry.scheduleEndTime || '',
  scheduleTime: entry.scheduleTime || '',
  location: entry.location || '',
  summary: entry.summary || '',
  imageUrl: entry.imageUrl || '',
  registrationUrl: entry.registrationUrl || '',
  eventId: entry.eventId ? Number(entry.eventId) : null,
  updatedAt: entry.updatedAt || new Date().toISOString()
});

const normalizeTimeValue = (value = '') => {
  const match = String(value || '').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    return '';
  }
  return `${match[1]}:${match[2]}`;
};

const parseTimeLabelTo24h = (value = '') => {
  const normalized24 = normalizeTimeValue(value);
  if (normalized24) {
    return normalized24;
  }

  const match = String(value || '').trim().toUpperCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/);
  if (!match) {
    return '';
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = match[3];
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return '';
  }

  if (meridiem === 'PM' && hour < 12) {
    hour += 12;
  }
  if (meridiem === 'AM' && hour === 12) {
    hour = 0;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const addMinutesToTime = (timeValue = '', minutesToAdd = 60) => {
  const normalized = normalizeTimeValue(timeValue);
  if (!normalized) {
    return '19:00';
  }

  const [hourText, minuteText] = normalized.split(':');
  const baseMinutes = (Number(hourText) * 60) + Number(minuteText);
  const nextMinutes = ((baseMinutes + Number(minutesToAdd || 0)) % (24 * 60) + (24 * 60)) % (24 * 60);
  const nextHour = Math.floor(nextMinutes / 60);
  const nextMinute = nextMinutes % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
};

const parseScheduleDateTime = (scheduleDate = '', scheduleTime = '', scheduleStartTime = '', scheduleEndTime = '') => {
  const safeDate = String(scheduleDate || '').trim();
  const fallback = new Date();

  if (!safeDate || !/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    const nextHour = new Date(fallback.getTime() + 60 * 60 * 1000);
    return {
      startIso: fallback.toISOString(),
      endIso: nextHour.toISOString()
    };
  }

  let startTime = normalizeTimeValue(scheduleStartTime);
  let endTime = normalizeTimeValue(scheduleEndTime);

  if (!startTime) {
    const raw = String(scheduleTime || '').trim();
    if (raw) {
      const parts = raw.split(/\s*(?:-|–|to)\s*/i).filter(Boolean);
      startTime = parseTimeLabelTo24h(parts[0] || raw);
      if (!endTime) {
        endTime = parseTimeLabelTo24h(parts[1] || '');
      }
    }
  }

  if (!startTime) {
    startTime = '18:00';
  }
  if (!endTime) {
    endTime = addMinutesToTime(startTime, 60);
  }

  const startIso = new Date(`${safeDate}T${startTime}:00`).toISOString();
  const endIso = new Date(`${safeDate}T${endTime}:00`).toISOString();
  return { startIso, endIso };
};

const toLinkedEventPayload = (entry) => {
  const { startIso, endIso } = parseScheduleDateTime(
    entry.scheduleDate,
    entry.scheduleTime,
    entry.scheduleStartTime,
    entry.scheduleEndTime
  );
  return {
    title: String(entry.title || 'Library Session').trim(),
    description: String(entry.summary || '').trim(),
    date: startIso,
    endDate: endIso,
    location: String(entry.location || 'Library Hall').trim(),
    category: 'Workshop',
    mediaUrl: String(entry.imageUrl || '').trim(),
    registrations: 0,
    active: true
  };
};

const resolveEventRegistrationUrl = ({ providedUrl = '', existingUrl = '', eventId = null }) => {
  const provided = String(providedUrl || '').trim();
  const existing = String(existingUrl || '').trim();

  if (provided && provided !== '/events') {
    return provided;
  }

  if (existing && existing !== '/events') {
    return existing;
  }

  if (eventId) {
    return `/events?eventId=${eventId}`;
  }

  return '/events';
};

const normalizePhysicalBook = (book = {}) => {
  const totalCopies = normalizeCount(book.totalCopies);
  let issueRecords = (book.issueRecords || []).map((record, index) => normalizeIssueRecord(record, index));

  // Backward compatibility for older records that only tracked counts.
  if (issueRecords.length === 0 && normalizeCount(book.issuedCopies) > 0) {
    const fallbackCount = Math.min(normalizeCount(book.issuedCopies), Math.max(1, totalCopies));
    issueRecords = Array.from({ length: fallbackCount }).map((_, index) => normalizeIssueRecord({
      copyNumber: index + 1,
      issuerName: 'Issued member',
      issuerPhone: '',
      issueDate: new Date().toISOString().slice(0, 10),
      returnDate: ''
    }, index));
  }

  const activeIssues = issueRecords.filter((record) => !record.returnedAt);
  const issuedCopies = Math.min(activeIssues.length, totalCopies);

  return {
    id: book.id || `book-${Date.now()}`,
    title: book.title || '',
    author: book.author || '',
    category: book.category || 'General',
    isbn: book.isbn || '',
    totalCopies,
    issuedCopies,
    issueRecords,
    notes: book.notes || '',
    updatedAt: book.updatedAt || new Date().toISOString()
  };
};

const normalizeDigitalResource = (resource = {}) => ({
  id: resource.id || `digital-${Date.now()}`,
  title: resource.title || '',
  fileType: resource.fileType || 'PDF',
  description: resource.description || '',
  downloadUrl: resource.downloadUrl || '',
  coverImageUrl: resource.coverImageUrl || '',
  tags: resource.tags || '',
  updatedAt: resource.updatedAt || new Date().toISOString()
});

const normalizeLibraryData = (content = {}) => ({
  physicalBooks: (content.physicalBooks || defaultLibraryData.physicalBooks).map(normalizePhysicalBook),
  digitalResources: (content.digitalResources || defaultLibraryData.digitalResources).map(normalizeDigitalResource),
  programUpdates: (content.programUpdates || defaultLibraryData.programUpdates).map(normalizeProgramUpdate),
  mediaResources: (content.mediaResources || defaultLibraryData.mediaResources).map(normalizeMediaResource)
});

const readLibraryData = async () => {
  try {
    const payload = await contentApiService.getSingleton(STORAGE_RESOURCE, null);
    if (!payload) {
      const seeded = normalizeLibraryData(defaultLibraryData);
      await contentApiService.setSingleton(STORAGE_RESOURCE, seeded);
      return seeded;
    }
    return normalizeLibraryData(payload);
  } catch {
    return normalizeLibraryData(defaultLibraryData);
  }
};

const persistLibraryData = async (nextData) => {
  const normalized = normalizeLibraryData(nextData);
  await contentApiService.setSingleton(STORAGE_RESOURCE, normalized);
  return normalized;
};

const pickOpenLibraryText = (value) => {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'object' && typeof value.value === 'string') {
    return value.value;
  }
  return '';
};

const pickOpenLibrarySubject = (subjects = []) => {
  const first = subjects[0];
  if (!first) {
    return '';
  }
  if (typeof first === 'string') {
    return first;
  }
  if (typeof first?.name === 'string') {
    return first.name;
  }
  return '';
};

const fetchOpenLibraryAuthors = async (authors = []) => {
  const directAuthor = authors
    .map((entry) => (typeof entry?.name === 'string' ? entry.name : ''))
    .find(Boolean);

  if (directAuthor) {
    return directAuthor;
  }

  const authorKeys = authors
    .map((entry) => (typeof entry?.key === 'string' ? entry.key : ''))
    .filter(Boolean);

  if (authorKeys.length === 0) {
    return '';
  }

  const responses = await Promise.allSettled(
    authorKeys.map(async (key) => {
      const response = await fetch(`https://openlibrary.org${key}.json`);
      if (!response.ok) {
        return '';
      }
      const data = await response.json();
      return data?.name || '';
    })
  );

  return responses
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value)
    .join(', ');
};

const libraryService = {
  getLibraryData: async () => serviceResponse(await readLibraryData()),

  lookupBookByIsbn: async (isbn) => {
    const normalizedIsbn = String(isbn || '').replace(/[^0-9Xx]/g, '').toUpperCase();
    if (!normalizedIsbn) {
      return serviceResponse({ found: false });
    }

    try {
      let googleDetails = {
        title: '',
        author: '',
        category: '',
        notes: ''
      };

      const googleResponse = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${normalizedIsbn}`);
      if (googleResponse.ok) {
        const googleData = await googleResponse.json();
        const firstGoogle = googleData?.items?.[0]?.volumeInfo;
        if (firstGoogle) {
          googleDetails = {
            title: firstGoogle.title || '',
            author: (firstGoogle.authors || []).join(', '),
            category: firstGoogle.categories?.[0] || '',
            notes: firstGoogle.description || ''
          };
        }
      }

      let openLibraryDetails = {
        title: '',
        author: '',
        category: '',
        notes: ''
      };

      const openLibraryResponse = await fetch(`https://openlibrary.org/isbn/${normalizedIsbn}.json`);
      if (openLibraryResponse.ok) {
        const openLibraryData = await openLibraryResponse.json();
        const openLibraryAuthor = await fetchOpenLibraryAuthors(openLibraryData?.authors || []);

        openLibraryDetails = {
          title: openLibraryData?.title || '',
          author: openLibraryAuthor || (openLibraryData?.by_statement || ''),
          category: pickOpenLibrarySubject(openLibraryData?.subjects || []),
          notes: pickOpenLibraryText(openLibraryData?.description) || openLibraryData?.subtitle || ''
        };
      }

      const mergedDetails = {
        title: googleDetails.title || openLibraryDetails.title || '',
        author: googleDetails.author || openLibraryDetails.author || '',
        category: googleDetails.category || openLibraryDetails.category || '',
        isbn: normalizedIsbn,
        notes: googleDetails.notes || openLibraryDetails.notes || ''
      };

      const hasAnyDetails = Boolean(
        mergedDetails.title ||
        mergedDetails.author ||
        mergedDetails.category ||
        mergedDetails.notes
      );

      if (!hasAnyDetails) {
        return serviceResponse({ found: false });
      }

      return serviceResponse({
        found: true,
        details: mergedDetails
      });
    } catch {
      return serviceResponse({ found: false });
    }
  },

  addPhysicalBook: async (payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      physicalBooks: [
        normalizePhysicalBook({
          ...payload,
          id: `book-${Date.now()}`,
          issueRecords: payload.issueRecords || [],
          updatedAt: new Date().toISOString()
        }),
        ...current.physicalBooks
      ]
    };

    return serviceResponse((await persistLibraryData(nextData)).physicalBooks);
  },

  updatePhysicalBook: async (id, payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      physicalBooks: current.physicalBooks.map((book) => (
        book.id === id
          ? normalizePhysicalBook({ ...book, ...payload, id, updatedAt: new Date().toISOString() })
          : book
      ))
    };

    return serviceResponse((await persistLibraryData(nextData)).physicalBooks);
  },

  removePhysicalBook: async (id) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      physicalBooks: current.physicalBooks.filter((book) => book.id !== id)
    };

    return serviceResponse((await persistLibraryData(nextData)).physicalBooks);
  },

  addIssueRecord: async (bookId, payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      physicalBooks: current.physicalBooks.map((book) => {
        if (book.id !== bookId) {
          return book;
        }

        const issueRecords = [
          ...book.issueRecords,
          normalizeIssueRecord({
            ...payload,
            id: `issue-${Date.now()}`,
            returnedAt: ''
          })
        ];

        return normalizePhysicalBook({
          ...book,
          issueRecords,
          updatedAt: new Date().toISOString()
        });
      })
    };

    return serviceResponse((await persistLibraryData(nextData)).physicalBooks);
  },

  markIssueReturned: async (bookId, issueId) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      physicalBooks: current.physicalBooks.map((book) => {
        if (book.id !== bookId) {
          return book;
        }

        const issueRecords = book.issueRecords.map((record) => (
          record.id === issueId
            ? { ...record, returnedAt: new Date().toISOString().slice(0, 10) }
            : record
        ));

        return normalizePhysicalBook({
          ...book,
          issueRecords,
          updatedAt: new Date().toISOString()
        });
      })
    };

    return serviceResponse((await persistLibraryData(nextData)).physicalBooks);
  },

  addDigitalResource: async (payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      digitalResources: [
        normalizeDigitalResource({ ...payload, id: `digital-${Date.now()}`, updatedAt: new Date().toISOString() }),
        ...current.digitalResources
      ]
    };

    return serviceResponse((await persistLibraryData(nextData)).digitalResources);
  },

  updateDigitalResource: async (id, payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      digitalResources: current.digitalResources.map((resource) => (
        resource.id === id
          ? normalizeDigitalResource({ ...resource, ...payload, id, updatedAt: new Date().toISOString() })
          : resource
      ))
    };

    return serviceResponse((await persistLibraryData(nextData)).digitalResources);
  },

  removeDigitalResource: async (id) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      digitalResources: current.digitalResources.filter((resource) => resource.id !== id)
    };

    return serviceResponse((await persistLibraryData(nextData)).digitalResources);
  },

  addProgramUpdate: async (payload) => {
    const createdEvent = await eventService.createEvent(toLinkedEventPayload(payload));
    const linkedEventId = Number(createdEvent?.data?.id || 0) || null;
    const registrationUrl = resolveEventRegistrationUrl({
      providedUrl: payload?.registrationUrl,
      eventId: linkedEventId
    });
    const current = await readLibraryData();
    const nextData = {
      ...current,
      programUpdates: [
        normalizeProgramUpdate({
          ...payload,
          id: `session-${Date.now()}`,
          eventId: linkedEventId,
          registrationUrl,
          updatedAt: new Date().toISOString()
        }),
        ...current.programUpdates
      ]
    };

    return serviceResponse((await persistLibraryData(nextData)).programUpdates);
  },

  updateProgramUpdate: async (id, payload) => {
    const current = await readLibraryData();
    const existing = current.programUpdates.find((entry) => entry.id === id);
    if (!existing) {
      return serviceResponse(current.programUpdates);
    }

    const merged = normalizeProgramUpdate({
      ...existing,
      ...payload,
      id,
      updatedAt: new Date().toISOString()
    });

    const eventPayload = toLinkedEventPayload(merged);
    if (merged.eventId) {
      await eventService.updateEvent(merged.eventId, eventPayload);
    } else {
      const createdEvent = await eventService.createEvent(eventPayload);
      merged.eventId = Number(createdEvent?.data?.id || 0) || null;
    }

    merged.registrationUrl = resolveEventRegistrationUrl({
      providedUrl: payload?.registrationUrl,
      existingUrl: existing.registrationUrl,
      eventId: merged.eventId
    });

    const nextData = {
      ...current,
      programUpdates: current.programUpdates.map((entry) => (
        entry.id === id
          ? merged
          : entry
      ))
    };

    return serviceResponse((await persistLibraryData(nextData)).programUpdates);
  },

  removeProgramUpdate: async (id) => {
    const current = await readLibraryData();
    const existing = current.programUpdates.find((entry) => entry.id === id);
    if (existing?.eventId) {
      await eventService.removeEvent(existing.eventId);
    }
    const nextData = {
      ...current,
      programUpdates: current.programUpdates.filter((entry) => entry.id !== id)
    };

    return serviceResponse((await persistLibraryData(nextData)).programUpdates);
  },

  addMediaResource: async (payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      mediaResources: [
        normalizeMediaResource({ ...payload, id: `media-res-${Date.now()}`, updatedAt: new Date().toISOString() }),
        ...current.mediaResources
      ]
    };

    return serviceResponse((await persistLibraryData(nextData)).mediaResources);
  },

  updateMediaResource: async (id, payload) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      mediaResources: current.mediaResources.map((entry) => (
        entry.id === id
          ? normalizeMediaResource({ ...entry, ...payload, id, updatedAt: new Date().toISOString() })
          : entry
      ))
    };

    return serviceResponse((await persistLibraryData(nextData)).mediaResources);
  },

  removeMediaResource: async (id) => {
    const current = await readLibraryData();
    const nextData = {
      ...current,
      mediaResources: current.mediaResources.filter((entry) => entry.id !== id)
    };

    return serviceResponse((await persistLibraryData(nextData)).mediaResources);
  }
};

export default libraryService;
