import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/24/outline';
import PageHero from '../../components/common/PageHero';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import notificationService from '../../services/notificationService';
import { useAuth } from '../../context/AuthContext';
import { siteConfig } from '../../constants/siteConfig';

const newsletterDefaults = {
  name: '',
  email: ''
};

const NewsletterSignupPage = () => {
  const meta = useSeoMeta('Newsletter', `Subscribe to updates from ${siteConfig.name}.`);
  const { user, isAuthenticated } = useAuth();
  const [isSignupModalOpen, setIsSignupModalOpen] = useState(true);
  const [isTopicDropdownOpen, setIsTopicDropdownOpen] = useState(false);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [topicError, setTopicError] = useState('');
  const topicDropdownRef = useRef(null);
  const form = useForm({ defaultValues: newsletterDefaults });

  const { data: topicOptions = [] } = useQuery({
    queryKey: ['newsletter-topics'],
    queryFn: () => notificationService.getNewsletterTopics().then((res) => res.data)
  });

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    form.reset({
      name: String(user?.name || '').trim(),
      email: String(user?.email || '').trim().toLowerCase()
    });
    setSelectedTopics([]);
    setTopicError('');
  }, [form, isAuthenticated, user?.email, user?.name]);

  const closeModal = () => {
    setIsSignupModalOpen(false);
    setIsTopicDropdownOpen(false);
    setTopicError('');
  };

  const openModal = () => {
    setIsSignupModalOpen(true);
    setIsTopicDropdownOpen(false);
    setTopicError('');
    subscribeMutation.reset();
  };

  const toggleTopic = (topic) => {
    const normalizedTopic = String(topic || '').trim();
    if (!normalizedTopic) {
      return;
    }

    setSelectedTopics((previous) => {
      const exists = previous.some((entry) => String(entry || '').toLowerCase() === normalizedTopic.toLowerCase());
      if (exists) {
        return previous.filter((entry) => String(entry || '').toLowerCase() !== normalizedTopic.toLowerCase());
      }
      return [...previous, normalizedTopic];
    });
    setTopicError('');
  };

  const subscribeMutation = useMutation({
    mutationFn: (values) => notificationService.subscribe({
      name: values.name,
      email: values.email,
      interests: selectedTopics,
      source: isAuthenticated ? 'Logged in user' : 'Website'
    }),
    onSuccess: () => {
      if (!isAuthenticated) {
        form.reset(newsletterDefaults);
      }
      setSelectedTopics([]);
      setTopicError('');
    }
  });

  const topicButtonLabel = selectedTopics.length > 0
    ? `${selectedTopics.length} topic${selectedTopics.length > 1 ? 's' : ''} selected`
    : 'Select topics';

  const handleSubscribe = (values) => {
    if (selectedTopics.length === 0) {
      setTopicError('Please select at least one topic.');
      return;
    }
    setTopicError('');
    subscribeMutation.mutate(values);
  };

  return (
    <div className="space-y-8">
      <Seo {...meta} />
      <PageHero
        title="Weekly Newsletter"
        description="Get weekly updates on events, seva opportunities, and community highlights. Select one or more topics so updates are mapped accurately."
      />

      <Card className="mx-auto max-w-3xl border border-brand-blue/15 bg-gradient-to-br from-white via-blue-50/40 to-amber-50/40">
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-blue/75">Community Updates</p>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Newsletter Signup</h2>
          <p className="max-w-xl text-sm text-slate-600">Subscribe for weekly sangat updates. Use the popup form and choose one or more topics for cleaner notification mapping.</p>
          <Button type="button" onClick={openModal} className="px-6 py-2 text-sm font-bold">
            Open Newsletter Form
          </Button>
        </div>
      </Card>

      {isSignupModalOpen ? (
        <div className="fixed inset-0 z-[170] bg-slate-950/60 px-4 py-6 backdrop-blur-md">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-4xl overflow-visible rounded-3xl border border-slate-200 bg-white shadow-[0_28px_90px_-40px_rgba(15,23,42,0.65)]">
              <div className="relative rounded-t-3xl bg-gradient-to-r from-brand-blue via-blue-700 to-brand-saffron px-5 py-4 text-white">
                <button
                  type="button"
                  onClick={closeModal}
                  className="absolute right-4 top-4 rounded-full border border-white/40 bg-white/10 p-1.5 text-white hover:bg-white/20"
                  aria-label="Close newsletter signup popup"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
                <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.18em] text-white/85">{siteConfig.name}</p>
                <h3 className="mt-1 whitespace-nowrap font-heading text-base font-extrabold sm:text-xl">Sign Up for Weekly Newsletter</h3>
                <p className="mt-2 text-sm text-white/90">Choose one or more topics to personalize your newsletter delivery.</p>
              </div>

              <form
                className="grid gap-4 p-5 md:grid-cols-2"
                onSubmit={form.handleSubmit(handleSubscribe)}
                onClickCapture={(event) => {
                  if (!isTopicDropdownOpen) {
                    return;
                  }
                  const target = event.target;
                  if (topicDropdownRef.current && target instanceof Node && !topicDropdownRef.current.contains(target)) {
                    setIsTopicDropdownOpen(false);
                  }
                }}
              >
                {subscribeMutation.isSuccess ? (
                  <div className="md:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                    <p className="text-base font-bold text-emerald-800">Thank you for subscribing.</p>
                    <p className="mt-1 text-sm text-emerald-700">You will receive updates based on your selected topics.</p>
                    <div className="mt-4">
                      <Button type="button" onClick={closeModal} className="px-5 py-2 text-sm font-bold">
                        OK
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <label className="text-sm font-semibold text-slate-700">Full name
                      <input
                        {...form.register('name', { required: true })}
                        readOnly={isAuthenticated}
                        required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                      />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Email
                      <input
                        type="email"
                        {...form.register('email', { required: true })}
                        readOnly={isAuthenticated}
                        required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                      />
                    </label>
                    <div ref={topicDropdownRef} className="text-sm font-semibold text-slate-700 md:col-span-2">
                      Topics
                      <div className="relative mt-1">
                        <button
                          type="button"
                          onClick={() => setIsTopicDropdownOpen((previous) => !previous)}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-left text-sm font-medium text-slate-700"
                          aria-expanded={isTopicDropdownOpen}
                        >
                          <span>{topicButtonLabel}</span>
                          <ChevronDownIcon className={`h-4 w-4 transition ${isTopicDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isTopicDropdownOpen ? (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                            {topicOptions.map((option) => {
                              const checked = selectedTopics.some((entry) => String(entry || '').toLowerCase() === String(option || '').toLowerCase());
                              return (
                                <label key={option} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-blue-50">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleTopic(option)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span>{option}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                      {selectedTopics.length > 0 ? (
                        <p className="mt-2 text-xs font-medium text-slate-600">Selected: {selectedTopics.join(', ')}</p>
                      ) : null}
                    </div>
                  </>
                )}

                {topicError && !subscribeMutation.isSuccess ? (
                  <p className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {topicError}
                  </p>
                ) : null}

                {subscribeMutation.isError ? (
                  <p className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {String(subscribeMutation.error?.message || 'Unable to subscribe right now.')}
                  </p>
                ) : null}

                <div className="md:col-span-2 flex justify-end gap-2 border-t border-slate-200 pt-4">
                  <Button type="button" variant="ghost" onClick={closeModal}>
                    Close
                  </Button>
                  {!subscribeMutation.isSuccess ? (
                    <Button type="submit" disabled={subscribeMutation.isPending}>
                      {subscribeMutation.isPending ? 'Subscribing...' : 'Subscribe'}
                    </Button>
                  ) : null}
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NewsletterSignupPage;
