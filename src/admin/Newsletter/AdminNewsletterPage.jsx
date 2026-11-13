import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import {
  CheckCircleIcon,
  EnvelopeIcon,
  FunnelIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import RichTextEditor from '../../components/forms/RichTextEditor';
import notificationService from '../../services/notificationService';

const CUSTOM_TOPIC_VALUE = '__custom_topic__';

const subscriberPageSize = 10;
const historyPageSize = 8;

const stripHtml = (value = '') => String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeTopicValues = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/[\n;,|]/g)
    .map((entry) => String(entry || '').trim())
    .filter(Boolean);
};

const normalizeTopicLabel = (value = '') => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const truncateText = (value = '', maxLength = 90) => {
  const raw = String(value || '').trim();
  if (raw.length <= maxLength) {
    return raw;
  }
  return `${raw.slice(0, maxLength).trimEnd()}...`;
};

const subscriberMatchesTopic = (subscriber = {}, campaignTopic = '') => {
  const normalizedCampaignTopic = normalizeTopicLabel(campaignTopic);
  if (!normalizedCampaignTopic) {
    return true;
  }

  const subscriberTopics = normalizeTopicValues(
    subscriber?.interestsList?.length ? subscriber.interestsList : subscriber?.interests
  );
  const normalizedSubscriberTopics = subscriberTopics.map((topic) => normalizeTopicLabel(topic));

  if (normalizedCampaignTopic === 'all announcements') {
    return true;
  }

  if (normalizedSubscriberTopics.includes(normalizedCampaignTopic)) {
    return true;
  }
  return false;
};

const toIsoDate = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toISOString().slice(0, 10);
};

const formatDayMonth = (isoDate = '') => {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const month = parsed.toLocaleString('en-US', { month: 'short' });
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${month}, ${day}`;
};

const buildWeekRangeOptions = (pastWeeks = 4, futureWeeks = 20) => {
  const now = new Date();
  const day = now.getDay();
  const offsetFromMonday = (day + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - offsetFromMonday);

  return Array.from({ length: pastWeeks + futureWeeks + 1 }, (_, index) => {
    const shift = index - pastWeeks;
    const start = new Date(monday);
    start.setDate(start.getDate() + shift * 7);

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const startIso = toIsoDate(start);
    const endIso = toIsoDate(end);

    return {
      value: `${startIso}|${endIso}`,
      label: `${formatDayMonth(startIso)} to ${formatDayMonth(endIso)}`,
      startIso,
      endIso
    };
  });
};

const campaignDefaults = {
  title: '',
  topic: '',
  customTopic: '',
  weekRange: '',
  status: 'draft'
};

const isCampaignWithinSelectedWeek = (campaign = {}) => {
  const start = toIsoDate(campaign?.weekStart || '');
  const end = toIsoDate(campaign?.weekEnd || '');
  if (!start || !end) {
    return false;
  }

  const today = toIsoDate(new Date());
  return today >= start && today <= end;
};

const resolveCampaignStatus = (campaign) => {
  const lifecycle = String(campaign?.lifecycleStatus || '').trim().toLowerCase();
  if (lifecycle === 'inactive') {
    return 'inactive';
  }
  return String(campaign?.status || 'draft').trim().toLowerCase();
};

const statusPillClassName = (status) => {
  if (status === 'sent') {
    return 'border border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (status === 'failed') {
    return 'border border-red-200 bg-red-50 text-red-700';
  }
  if (status === 'inactive') {
    return 'border border-slate-300 bg-slate-100 text-slate-700';
  }
  return 'border border-amber-200 bg-amber-50 text-amber-700';
};

const AdminNewsletterPage = () => {
  const { setHeaderAction } = useOutletContext();
  const queryClient = useQueryClient();
  const campaignForm = useForm({ defaultValues: campaignDefaults });
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState('');
  const [editorHtml, setEditorHtml] = useState('');
  const [createError, setCreateError] = useState('');
  const [subscriberSearch, setSubscriberSearch] = useState('');
  const [subscriberPage, setSubscriberPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [historyTopic, setHistoryTopic] = useState('all');
  const [historyWeek, setHistoryWeek] = useState('all');
  const [historySort, setHistorySort] = useState('date_desc');
  const [historyPage, setHistoryPage] = useState(1);

  const weekOptions = useMemo(() => buildWeekRangeOptions(), []);
  const selectedTopic = campaignForm.watch('topic');

  const { data: subscribers = [] } = useQuery({
    queryKey: ['subscribers'],
    queryFn: () => notificationService.getSubscribers().then((res) => res.data)
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['newsletter-campaigns'],
    queryFn: () => notificationService.getNewsletterCampaigns().then((res) => res.data)
  });

  const { data: topicOptions = [] } = useQuery({
    queryKey: ['newsletter-topics'],
    queryFn: () => notificationService.getNewsletterTopics().then((res) => res.data)
  });

  const topicSubscriberCounts = useMemo(() => {
    const counts = new Map();
    const allTopics = new Set([
      ...topicOptions,
      ...campaigns.map((entry) => String(entry?.topic || '').trim()).filter(Boolean)
    ]);

    allTopics.forEach((topic) => {
      const count = subscribers.filter((entry) => (
        entry?.active !== false
        && Boolean(entry?.email)
        && subscriberMatchesTopic(entry, topic)
      )).length;
      counts.set(normalizeTopicLabel(topic), count);
    });

    return counts;
  }, [subscribers, topicOptions, campaigns]);

  const historyTopicOptions = useMemo(() => {
    const campaignTopics = campaigns
      .map((entry) => String(entry?.topic || '').trim())
      .filter(Boolean);
    const merged = new Set([...topicOptions, ...campaignTopics]);
    return Array.from(merged).sort((left, right) => String(left).localeCompare(String(right)));
  }, [campaigns, topicOptions]);

  const historyWeekOptions = useMemo(() => {
    const seen = new Set();
    return campaigns
      .filter((entry) => entry?.weekStart && entry?.weekEnd)
      .map((entry) => {
        const value = `${entry.weekStart}|${entry.weekEnd}`;
        if (seen.has(value)) {
          return null;
        }
        seen.add(value);
        return {
          value,
          label: `${formatDayMonth(entry.weekStart)} to ${formatDayMonth(entry.weekEnd)}`
        };
      })
      .filter(Boolean)
      .sort((left, right) => String(right.value).localeCompare(String(left.value)));
  }, [campaigns]);

  const createCampaignMutation = useMutation({
    mutationFn: (values) => notificationService.createNewsletterCampaign(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['newsletter-topics'] });
      campaignForm.reset(campaignDefaults);
      setEditingCampaignId('');
      setEditorHtml('');
      setCreateError('');
      setCreateOpen(false);
    }
  });

  const updateCampaignMutation = useMutation({
    mutationFn: ({ id, values }) => notificationService.updateNewsletterCampaign(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['newsletter-topics'] });
      campaignForm.reset(campaignDefaults);
      setEditingCampaignId('');
      setEditorHtml('');
      setCreateError('');
      setCreateOpen(false);
    }
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: (id) => notificationService.deleteNewsletterCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-campaigns'] });
    }
  });

  const sendCampaignMutation = useMutation({
    mutationFn: (id) => notificationService.sendNewsletterCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['newsletter-campaigns'] });
    }
  });

  const updateSubscriberMutation = useMutation({
    mutationFn: ({ id, values }) => notificationService.updateSubscriber(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
    }
  });

  const deleteSubscriberMutation = useMutation({
    mutationFn: (id) => notificationService.removeSubscriber(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscribers'] });
    }
  });

  const filteredSubscribers = useMemo(() => {
    const query = String(subscriberSearch || '').trim().toLowerCase();
    if (!query) {
      return subscribers;
    }

    return subscribers.filter((entry) => {
      const haystack = [entry.name, entry.email, entry.interests, entry.source]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [subscriberSearch, subscribers]);

  const historyRows = useMemo(() => {
    const query = String(historySearch || '').trim().toLowerCase();
    const filtered = campaigns.filter((entry) => {
      const effectiveStatus = resolveCampaignStatus(entry);
      if (historyStatus !== 'all' && effectiveStatus !== historyStatus) {
        return false;
      }

      if (historyTopic !== 'all') {
        const topic = String(entry?.topic || '').trim().toLowerCase();
        if (topic !== String(historyTopic || '').trim().toLowerCase()) {
          return false;
        }
      }

      if (historyWeek !== 'all') {
        const weekValue = `${String(entry?.weekStart || '').trim()}|${String(entry?.weekEnd || '').trim()}`;
        if (weekValue !== historyWeek) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = [
        entry.title,
        entry.topic,
        effectiveStatus,
        entry.sentAt,
        entry.errorReason,
        entry.weekStart,
        entry.weekEnd,
        stripHtml(entry.body || entry.bodyHtml || '')
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });

    return [...filtered].sort((left, right) => {
      if (historySort === 'date_asc' || historySort === 'date_desc') {
        const leftDate = new Date(left.sentAt || left.createdAt || 0).getTime();
        const rightDate = new Date(right.sentAt || right.createdAt || 0).getTime();
        return historySort === 'date_asc' ? leftDate - rightDate : rightDate - leftDate;
      }

      if (historySort === 'status_asc') {
        return resolveCampaignStatus(left).localeCompare(resolveCampaignStatus(right));
      }

      if (historySort === 'status_desc') {
        return resolveCampaignStatus(right).localeCompare(resolveCampaignStatus(left));
      }

      const leftRecipients = Number(left.recipientsCount || 0);
      const rightRecipients = Number(right.recipientsCount || 0);
      return historySort === 'recipients_asc' ? leftRecipients - rightRecipients : rightRecipients - leftRecipients;
    });
  }, [campaigns, historySearch, historySort, historyStatus, historyTopic, historyWeek]);

  const campaignAudienceCounts = useMemo(() => {
    const counts = new Map();
    campaigns.forEach((campaign) => {
      const campaignId = String(campaign?.id || '').trim();
      if (!campaignId) {
        return;
      }

      const audienceCount = subscribers.filter((entry) => (
        entry?.active !== false
        && Boolean(entry?.email)
        && subscriberMatchesTopic(entry, campaign?.topic)
      )).length;

      counts.set(campaignId, audienceCount);
    });
    return counts;
  }, [campaigns, subscribers]);

  const kpi = useMemo(() => {
    const totalSubscribers = subscribers.length;
    const activeSubscribers = subscribers.filter((entry) => entry.active !== false).length;
    const totalCampaigns = campaigns.length;
    const inactiveCampaigns = campaigns.filter((entry) => resolveCampaignStatus(entry) === 'inactive').length;
    const sentCampaigns = campaigns.filter((entry) => resolveCampaignStatus(entry) === 'sent').length;

    return {
      totalSubscribers,
      activeSubscribers,
      totalCampaigns,
      inactiveCampaigns,
      sentCampaigns
    };
  }, [campaigns, subscribers]);

  const subscriberTotalPages = Math.max(1, Math.ceil(filteredSubscribers.length / subscriberPageSize));
  const safeSubscriberPage = Math.min(subscriberPage, subscriberTotalPages);
  const paginatedSubscribers = useMemo(() => {
    const startIndex = (safeSubscriberPage - 1) * subscriberPageSize;
    return filteredSubscribers.slice(startIndex, startIndex + subscriberPageSize);
  }, [filteredSubscribers, safeSubscriberPage]);

  const historyTotalPages = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const paginatedHistoryRows = useMemo(() => {
    const startIndex = (safeHistoryPage - 1) * historyPageSize;
    return historyRows.slice(startIndex, startIndex + historyPageSize);
  }, [historyRows, safeHistoryPage]);

  useEffect(() => {
    setHeaderAction(
      <AdminHeaderActionButton
        label="Add Newsletter"
        icon={PlusIcon}
        onClick={() => {
          setCreateOpen(true);
          setEditingCampaignId('');
          setCreateError('');
          setEditorHtml('');
          campaignForm.reset({
            ...campaignDefaults,
            weekRange: weekOptions[0]?.value || ''
          });
        }}
      />
    );

    return () => setHeaderAction(null);
  }, [campaignForm, setHeaderAction, weekOptions]);

  useEffect(() => {
    setSubscriberPage(1);
  }, [subscriberSearch]);

  useEffect(() => {
    if (safeSubscriberPage !== subscriberPage) {
      setSubscriberPage(safeSubscriberPage);
    }
  }, [safeSubscriberPage, subscriberPage]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historySearch, historySort, historyStatus, historyTopic, historyWeek]);

  useEffect(() => {
    if (safeHistoryPage !== historyPage) {
      setHistoryPage(safeHistoryPage);
    }
  }, [safeHistoryPage, historyPage]);

  const handleCreateCampaign = (values) => {
    const chosenTopic = String(values.topic || '').trim();
    const customTopic = String(values.customTopic || '').trim();
    const topic = chosenTopic === CUSTOM_TOPIC_VALUE ? customTopic : chosenTopic;
    if (!topic) {
      setCreateError('Please choose a topic.');
      return;
    }

    const weekRange = String(values.weekRange || '').trim();
    const [weekStart, weekEnd] = weekRange.split('|');
    if (!weekStart || !weekEnd) {
      setCreateError('Please select a newsletter week range.');
      return;
    }

    const bodyHtml = String(editorHtml || '').trim();
    const body = stripHtml(bodyHtml);
    if (!body) {
      setCreateError('Please add newsletter content.');
      return;
    }

    setCreateError('');
    const payload = {
      title: values.title,
      topic,
      weekStart,
      weekEnd,
      status: values.status,
      body,
      bodyHtml
    };

    if (editingCampaignId) {
      updateCampaignMutation.mutate({ id: editingCampaignId, values: payload });
      return;
    }

    createCampaignMutation.mutate(payload);
  };

  const handleEditCampaign = (campaign) => {
    const currentTopic = String(campaign?.topic || '').trim();
    const hasPredefinedTopic = topicOptions.some((entry) => String(entry || '').trim().toLowerCase() === currentTopic.toLowerCase());
    const weekRangeValue = campaign?.weekStart && campaign?.weekEnd
      ? `${campaign.weekStart}|${campaign.weekEnd}`
      : (weekOptions[0]?.value || '');
    const effectiveStatus = resolveCampaignStatus(campaign);

    campaignForm.reset({
      title: String(campaign?.title || '').trim(),
      topic: hasPredefinedTopic ? currentTopic : (currentTopic ? CUSTOM_TOPIC_VALUE : ''),
      customTopic: hasPredefinedTopic ? '' : currentTopic,
      weekRange: weekRangeValue,
      status: effectiveStatus === 'inactive' ? 'draft' : effectiveStatus
    });

    setEditorHtml(String(campaign?.bodyHtml || campaign?.body || '').trim());
    setEditingCampaignId(String(campaign?.id || ''));
    setCreateError('');
    setCreateOpen(true);
  };

  const handleDeleteCampaign = (campaign) => {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) {
      return;
    }

    deleteCampaignMutation.mutate(campaignId);
  };

  const handleEditSubscriber = (subscriber) => {
    const id = String(subscriber?.id || '').trim();
    if (!id) {
      return;
    }

    const currentName = String(subscriber?.name || '').trim();
    const currentInterests = String(subscriber?.interests || '').trim();
    const currentSource = String(subscriber?.source || '').trim();

    const name = window.prompt('Subscriber name', currentName || '');
    if (name == null) {
      return;
    }

    const interests = window.prompt('Interests/topic', currentInterests || 'Events and updates');
    if (interests == null) {
      return;
    }

    const source = window.prompt('Source', currentSource || 'Website');
    if (source == null) {
      return;
    }

    updateSubscriberMutation.mutate({
      id,
      values: {
        ...subscriber,
        name: String(name || '').trim(),
        interests: String(interests || '').trim(),
        source: String(source || '').trim()
      }
    });
  };

  const handleDeleteSubscriber = (subscriber) => {
    const id = String(subscriber?.id || '').trim();
    if (!id) {
      return;
    }

    deleteSubscriberMutation.mutate(id);
  };

  return (
    <div className="space-y-6">
      {sendCampaignMutation.isPending ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl border border-brand-blue/20 bg-white p-5 text-center shadow-2xl">
            <div className="donation-email-send-loader" aria-hidden="true">
              <span className="donation-email-send-orb donation-email-send-orb-saffron" />
              <span className="donation-email-send-orb donation-email-send-orb-blue" />
              <span className="donation-email-send-orb donation-email-send-orb-gold" />
              <div className="donation-email-send-envelope-wrap">
                <EnvelopeIcon className="h-7 w-7" />
              </div>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">Please wait, sending emails...</p>
            <p className="mt-1 text-xs text-slate-600">Delivering newsletter campaign to subscribers.</p>
          </div>
        </div>
      ) : null}

      <h1 className="sr-only">Newsletter Admin</h1>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subscribers</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpi.totalSubscribers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Subscribers</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{kpi.activeSubscribers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Campaigns</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{kpi.totalCampaigns}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sent</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{kpi.sentCampaigns}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inactive</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{kpi.inactiveCampaigns}</p>
        </Card>
      </div>

      <Card className="overflow-hidden border border-slate-200 bg-gradient-to-b from-white via-slate-50/40 to-blue-50/30 shadow-sm">
        <div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Subscribers</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Audience directory for newsletter distribution</p>
            </div>
            <span className="rounded-full border border-brand-blue/25 bg-blue-50 px-3 py-1 text-xs font-semibold text-brand-blue">{filteredSubscribers.length} records</span>
          </div>

          <label className="mt-3 block text-sm font-semibold text-slate-700">
            Search subscribers
            <input
              type="search"
              value={subscriberSearch}
              onChange={(event) => setSubscriberSearch(event.target.value)}
              placeholder="Search name, email, interests"
              className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm"
            />
          </label>
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
          <table className="table-fixed min-w-full text-left text-sm">
            <thead className="bg-slate-100/90 text-slate-600">
              <tr>
                <th className="w-[18%] px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Name</th>
                <th className="w-[28%] px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Email</th>
                <th className="w-[24%] px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Interests</th>
                <th className="w-[20%] px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Source</th>
                <th className="w-[10%] px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedSubscribers.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 hover:bg-blue-50/30">
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    <span className="block truncate" title={entry.name || '-'}>{entry.name || '-'}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    <span className="block truncate" title={entry.email}>{entry.email}</span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    <span className="block truncate text-xs" title={entry.interests}>{truncateText(entry.interests, 60)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">{entry.source}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEditSubscriber(entry)}
                        disabled={updateSubscriberMutation.isPending || deleteSubscriberMutation.isPending}
                        title="Edit subscriber"
                        aria-label="Edit subscriber"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubscriber(entry)}
                        disabled={updateSubscriberMutation.isPending || deleteSubscriberMutation.isPending}
                        title="Delete subscriber"
                        aria-label="Delete subscriber"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedSubscribers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>No subscribers found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-3 lg:hidden">
          {paginatedSubscribers.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{entry.name || '-'}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleEditSubscriber(entry)}
                    disabled={updateSubscriberMutation.isPending || deleteSubscriberMutation.isPending}
                    title="Edit subscriber"
                    aria-label="Edit subscriber"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubscriber(entry)}
                    disabled={updateSubscriberMutation.isPending || deleteSubscriberMutation.isPending}
                    title="Delete subscriber"
                    aria-label="Delete subscriber"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-600">{entry.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700" title={entry.interests}>{truncateText(entry.interests, 60)}</span>
                <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">{entry.source}</span>
              </div>
            </div>
          ))}
          {paginatedSubscribers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">No subscribers found.</div>
          ) : null}
        </div>

        {filteredSubscribers.length > 0 ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <p className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Page {safeSubscriberPage}/{subscriberTotalPages}
            </p>
            <button
              type="button"
              onClick={() => setSubscriberPage((prev) => Math.max(1, prev - 1))}
              disabled={safeSubscriberPage === 1}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setSubscriberPage((prev) => Math.min(subscriberTotalPages, prev + 1))}
              disabled={safeSubscriberPage >= subscriberTotalPages}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </Card>

      <Card className="overflow-hidden border border-slate-200 bg-gradient-to-b from-white via-slate-50/30 to-brand-blue/5 shadow-sm">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Newsletter History</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">Track campaign lifecycle, recipients, and send status</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              <FunnelIcon className="h-3.5 w-3.5" />
              {historyRows.length} filtered
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_170px_1fr_1fr_220px]">
            <label className="text-sm font-semibold text-slate-700">
              Search history
              <input
                type="search"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Search title, topic, content"
                className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Status
              <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm">
                <option value="all">All</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="failed">Failed</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Topic
              <select value={historyTopic} onChange={(event) => setHistoryTopic(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm">
                <option value="all">All topics</option>
                {historyTopicOptions.map((topic) => (
                  <option key={topic} value={topic}>{topic} ({topicSubscriberCounts.get(normalizeTopicLabel(topic)) || 0})</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Week
              <select value={historyWeek} onChange={(event) => setHistoryWeek(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm">
                <option value="all">All weeks</option>
                {historyWeekOptions.map((week) => (
                  <option key={week.value} value={week.value}>{week.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sort by
              <select value={historySort} onChange={(event) => setHistorySort(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm">
                <option value="date_desc">Date: Newest first</option>
                <option value="date_asc">Date: Oldest first</option>
                <option value="status_asc">Status: A-Z</option>
                <option value="status_desc">Status: Z-A</option>
                <option value="recipients_desc">Recipients: High to low</option>
                <option value="recipients_asc">Recipients: Low to high</option>
              </select>
            </label>
          </div>
        </div>

        <div className="mt-3 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100/90 text-slate-600">
              <tr>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Title</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Topic</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Week</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Reach</th>
                <th className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedHistoryRows.map((campaign) => {
                const effectiveStatus = resolveCampaignStatus(campaign);
                const audienceCount = campaignAudienceCounts.get(String(campaign?.id || '').trim()) || 0;
                const isWithinWeekWindow = isCampaignWithinSelectedWeek(campaign);
                const isSendDisabled = sendCampaignMutation.isPending || effectiveStatus === 'sent' || !isWithinWeekWindow;
                const isRowBusy = sendCampaignMutation.isPending || updateCampaignMutation.isPending || deleteCampaignMutation.isPending;
                return (
                  <tr key={campaign.id} className="border-t border-slate-100 hover:bg-blue-50/30">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-900">{campaign.title || 'Untitled campaign'}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusPillClassName(effectiveStatus)}`}>
                        {effectiveStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{campaign.topic || '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{campaign.weekStart && campaign.weekEnd ? `${formatDayMonth(campaign.weekStart)} to ${formatDayMonth(campaign.weekEnd)}` : '-'}</td>
                    <td className="px-3 py-2.5 text-slate-700">
                      <p className="text-sm font-medium text-slate-800">{campaign.sentAt ? (campaign.recipientsCount || 0) : audienceCount} recipients</p>
                      <p className="text-xs text-slate-500">{campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : 'Not sent'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => sendCampaignMutation.mutate(campaign.id)}
                          disabled={isSendDisabled}
                          title={effectiveStatus === 'sent' ? 'Already sent' : !isWithinWeekWindow ? 'Send is allowed only during the selected week' : 'Send campaign'}
                          aria-label={effectiveStatus === 'sent' ? 'Already sent' : !isWithinWeekWindow ? 'Send is allowed only during the selected week' : 'Send campaign'}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${
                            effectiveStatus === 'sent'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              : !isWithinWeekWindow
                                ? 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                                : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          {effectiveStatus === 'sent' ? <CheckCircleIcon className="h-4 w-4" /> : null}
                          {!isWithinWeekWindow ? <LockClosedIcon className="h-4 w-4" /> : null}
                          {effectiveStatus !== 'sent' && isWithinWeekWindow ? <PaperAirplaneIcon className="h-4 w-4" /> : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEditCampaign(campaign)}
                          disabled={isRowBusy}
                          title="Edit campaign"
                          aria-label="Edit campaign"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCampaign(campaign)}
                          disabled={isRowBusy}
                          title="Delete campaign"
                          aria-label="Delete campaign"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {paginatedHistoryRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>No campaigns found for these filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-3 lg:hidden">
          {paginatedHistoryRows.map((campaign) => {
            const effectiveStatus = resolveCampaignStatus(campaign);
            const audienceCount = campaignAudienceCounts.get(String(campaign?.id || '').trim()) || 0;
            const isWithinWeekWindow = isCampaignWithinSelectedWeek(campaign);
            const isSendDisabled = sendCampaignMutation.isPending || effectiveStatus === 'sent' || !isWithinWeekWindow;
            const isRowBusy = sendCampaignMutation.isPending || updateCampaignMutation.isPending || deleteCampaignMutation.isPending;
            return (
              <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{campaign.title || 'Untitled campaign'}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => sendCampaignMutation.mutate(campaign.id)}
                      disabled={isSendDisabled}
                      title={effectiveStatus === 'sent' ? 'Already sent' : !isWithinWeekWindow ? 'Send is allowed only during the selected week' : 'Send campaign'}
                      aria-label={effectiveStatus === 'sent' ? 'Already sent' : !isWithinWeekWindow ? 'Send is allowed only during the selected week' : 'Send campaign'}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-45 ${
                        effectiveStatus === 'sent'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : !isWithinWeekWindow
                            ? 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                            : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                      }`}
                    >
                      {effectiveStatus === 'sent' ? <CheckCircleIcon className="h-4 w-4" /> : null}
                      {!isWithinWeekWindow ? <LockClosedIcon className="h-4 w-4" /> : null}
                      {effectiveStatus !== 'sent' && isWithinWeekWindow ? <PaperAirplaneIcon className="h-4 w-4" /> : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleEditCampaign(campaign)}
                      disabled={isRowBusy}
                      title="Edit campaign"
                      aria-label="Edit campaign"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-amber-700 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCampaign(campaign)}
                      disabled={isRowBusy}
                      title="Delete campaign"
                      aria-label="Delete campaign"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${statusPillClassName(effectiveStatus)}`}>
                    {effectiveStatus}
                  </span>
                  <p className="text-xs text-slate-600">{campaign.topic || '-'}</p>
                </div>
                <p className="mt-2 text-xs text-slate-600">Week: {campaign.weekStart && campaign.weekEnd ? `${formatDayMonth(campaign.weekStart)} to ${formatDayMonth(campaign.weekEnd)}` : '-'}</p>
                <p className="text-xs text-slate-600">Reach: {campaign.sentAt ? (campaign.recipientsCount || 0) : audienceCount} recipients • {campaign.sentAt ? new Date(campaign.sentAt).toLocaleDateString() : 'Not sent'}</p>
              </div>
            );
          })}
          {paginatedHistoryRows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">No campaigns found for these filters.</div>
          ) : null}
        </div>

        {historyRows.length > 0 ? (
          <div className="mt-3 flex items-center justify-end gap-2 text-sm">
            <p className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Page {safeHistoryPage}/{historyTotalPages}
            </p>
            <button
              type="button"
              onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
              disabled={safeHistoryPage === 1}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setHistoryPage((prev) => Math.min(historyTotalPages, prev + 1))}
              disabled={safeHistoryPage >= historyTotalPages}
              className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </Card>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setCreateOpen(false)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_34px_90px_-28px_rgba(15,23,42,0.45)] sm:my-5 sm:max-h-[calc(100vh-2.5rem)]">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-r from-brand-blue via-blue-700 to-brand-saffron px-5 py-4 text-white md:px-6">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/85">Newsletter Studio</p>
                <h3 className="mt-1 font-heading text-xl font-bold md:text-2xl">{editingCampaignId ? 'Edit Newsletter Campaign' : "Craft This Week's Newsletter"}</h3>
                <p className="mt-1.5 text-sm text-white/90">Choose the topic and week, design your content, and publish or schedule the campaign.</p>
              </div>
              <button type="button" onClick={() => { setCreateOpen(false); setEditingCampaignId(''); }} className="rounded-full border border-white/30 bg-white/10 p-2 text-white transition hover:bg-white/20" aria-label="Close add newsletter modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-50 via-white to-slate-50 px-5 py-4 md:px-6" onSubmit={campaignForm.handleSubmit(handleCreateCampaign)}>
              <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Campaign Settings</p>
                    <div className="mt-2 h-px w-full bg-slate-200" />
                  </div>

                  <div className="grid gap-3">
                    <label className="text-sm font-semibold text-slate-700">Week
                      <select {...campaignForm.register('weekRange', { required: true })} required className="mt-1 h-9 w-full rounded-xl border border-slate-300 px-3 text-sm">
                        <option value="">Select week range</option>
                        {weekOptions.map((week) => (
                          <option key={week.value} value={week.value}>{week.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Delivery Status
                      <select {...campaignForm.register('status')} className="mt-1 h-9 w-full rounded-xl border border-slate-300 px-3 text-sm">
                        <option value="draft">Draft</option>
                        <option value="failed">Failed</option>
                        <option value="sent">Sent</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="grid gap-3">
                    <label className="text-sm font-semibold text-slate-700">Topic
                      <select {...campaignForm.register('topic', { required: true })} required className="mt-1 h-9 w-full rounded-xl border border-slate-300 px-3 text-sm">
                        <option value="">Select topic</option>
                        {topicOptions.map((topic) => (
                          <option key={topic} value={topic}>{topic} ({topicSubscriberCounts.get(normalizeTopicLabel(topic)) || 0})</option>
                        ))}
                        <option value={CUSTOM_TOPIC_VALUE}>Custom (Add New Topic)</option>
                      </select>
                    </label>
                    {selectedTopic === CUSTOM_TOPIC_VALUE ? (
                      <label className="text-sm font-semibold text-slate-700">Custom Topic
                        <input {...campaignForm.register('customTopic', { required: true })} placeholder="Enter new topic" required className="mt-1 h-9 w-full rounded-xl border border-slate-300 px-3 text-sm" />
                      </label>
                    ) : null}
                    <label className="text-sm font-semibold text-slate-700">Title
                      <input {...campaignForm.register('title', { required: true })} required className="mt-1 h-9 w-full rounded-xl border border-slate-300 px-3 text-sm" />
                    </label>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-slate-800">Message Content</p>
                    <p className="mt-1 text-xs text-slate-500">Style your message with headings, colors, links, tables, and images before saving.</p>
                    <div className="mt-2 h-px w-full bg-slate-200" />
                  </div>
                  <RichTextEditor value={editorHtml} onChange={setEditorHtml} minHeight={180} />
                </section>
              </div>

              {createError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{createError}</p>
              ) : null}

              {createCampaignMutation.isError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {String(createCampaignMutation.error?.message || 'Unable to save newsletter campaign right now.')}
                </p>
              ) : null}

              {updateCampaignMutation.isError ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {String(updateCampaignMutation.error?.message || 'Unable to update newsletter campaign right now.')}
                </p>
              ) : null}

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3">
                <Button type="button" variant="ghost" onClick={() => { setCreateOpen(false); setEditingCampaignId(''); }}>Cancel</Button>
                <Button type="submit" disabled={createCampaignMutation.isPending || updateCampaignMutation.isPending}>
                  {createCampaignMutation.isPending || updateCampaignMutation.isPending ? 'Saving...' : (editingCampaignId ? 'Save Changes' : 'Save Draft')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminNewsletterPage;
