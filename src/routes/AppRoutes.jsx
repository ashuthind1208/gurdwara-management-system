import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LedEmergencyGuard from '../components/boards/LedEmergencyGuard';
import PublicLayout from '../layouts/PublicLayout';
import AdminLayout from '../layouts/AdminLayout';
import ProtectedRoute from './ProtectedRoute';
import AutoReloadOnNewBuild from '../components/boards/AutoReloadOnNewBuild';
import { userRoles } from '../constants/siteConfig';

const HomePage = lazy(() => import('../pages/Home/HomePage'));
const AboutPage = lazy(() => import('../pages/About/AboutPage'));
const SikhismPage = lazy(() => import('../pages/Sikhism/SikhismPage'));
const GurbaniLibraryPage = lazy(() => import('../pages/GurbaniLibrary/GurbaniLibraryPage'));
const HukamnamaPage = lazy(() => import('../pages/Hukamnama/HukamnamaPage'));
const EventsPage = lazy(() => import('../pages/Events/EventsPage'));
const BookingsPage = lazy(() => import('../pages/Bookings/BookingsPage'));
const SevaPage = lazy(() => import('../pages/Seva/SevaPage'));
const FamilyDashboardPage = lazy(() => import('../pages/Family/FamilyDashboardPage'));
const DonationPage = lazy(() => import('../pages/Donation/DonationPage'));
const QuickDonatePage = lazy(() => import('../pages/Donation/QuickDonatePage'));
const QuickDonateBoardPage = lazy(() => import('../pages/Donation/QuickDonateBoardPage'));
const QuickDonateSuccessPage = lazy(() => import('../pages/Donation/QuickDonateSuccessPage'));
const KidsLearningPage = lazy(() => import('../pages/KidsLearning/KidsLearningPage'));
const DonationDisplayBoardPage = lazy(() => import('../pages/Donation/DonationDisplayBoardPage'));
const EventCalendarBoardPage = lazy(() => import('../pages/Events/EventCalendarBoardPage'));
const LangarDisplayBoardPage = lazy(() => import('../pages/Langar/LangarDisplayBoardPage'));
const LangarItemContributionPage = lazy(() => import('../pages/Langar/LangarItemContributionPage'));
const DailyScheduleDisplayBoardPage = lazy(() => import('../pages/Schedule/DailyScheduleDisplayBoardPage'));
const LedBoardLauncherPage = lazy(() => import('../pages/Boards/LedBoardLauncherPage'));
const LedAnnouncementsBoardPage = lazy(() => import('../pages/Boards/LedAnnouncementsBoardPage'));
const CommunityAnnouncementsBoardPage = lazy(() => import('../pages/Boards/CommunityAnnouncementsBoardPage'));
const LedHukamnamaBoardPage = lazy(() => import('../pages/Boards/LedHukamnamaBoardPage'));
const RecitationLedBoardPage = lazy(() => import('../pages/Recitation/RecitationLedBoardPage'));
const StreamOverlayPage = lazy(() => import('../pages/Recitation/StreamOverlayPage'));
const RecitationFollowPage = lazy(() => import('../pages/Recitation/RecitationFollowPage'));
const GranthiRemotePage = lazy(() => import('../pages/Recitation/GranthiRemotePage'));
const AskGranthiBoardPage = lazy(() => import('../pages/AskGranthi/AskGranthiBoardPage'));
const AskGranthiQuestionPage = lazy(() => import('../pages/AskGranthi/AskGranthiQuestionPage'));
const DonationSuccessPage = lazy(() => import('../pages/Donation/DonationSuccessPage'));
const GalleryPage = lazy(() => import('../pages/Gallery/GalleryPage'));
const MediaPage = lazy(() => import('../pages/Media/MediaPage'));
const NewsPage = lazy(() => import('../pages/News/NewsPage'));
const LibraryPage = lazy(() => import('../pages/Library/LibraryPage'));
const VideosPage = lazy(() => import('../pages/Videos/VideosPage'));
const FaqPage = lazy(() => import('../pages/FAQ/FaqPage'));
const ContactPage = lazy(() => import('../pages/Contact/ContactPage'));
const LoginPage = lazy(() => import('../pages/Auth/LoginPage'));

const AdminDashboardPage = lazy(() => import('../admin/Dashboard/AdminDashboardPage'));
const AdminCmsPage = lazy(() => import('../admin/CMS/AdminCmsPage'));
const AdminNewsPage = lazy(() => import('../admin/News/AdminNewsPage'));
const AdminSchedulePage = lazy(() => import('../admin/Schedule/AdminSchedulePage'));
const AdminHukamnamaPage = lazy(() => import('../admin/Hukamnama/AdminHukamnamaPage'));
const AdminAskGranthiPage = lazy(() => import('../admin/AskGranthi/AdminAskGranthiPage'));
const AdminGurdwaraBrandingPage = lazy(() => import('../admin/Branding/AdminGurdwaraBrandingPage'));
const AdminLangarPage = lazy(() => import('../admin/Langar/AdminLangarPage'));
const AdminSevaOpportunitiesPage = lazy(() => import('../admin/SevaOpportunities/AdminSevaOpportunitiesPage'));
const AdminGalleryPage = lazy(() => import('../admin/Gallery/AdminGalleryPage'));
const AdminLibraryPage = lazy(() => import('../admin/Library/AdminLibraryPage'));
const AdminVideosPage = lazy(() => import('../admin/Videos/AdminVideosPage'));
const AdminStreamingPage = lazy(() => import('../admin/Streaming/AdminStreamingPage'));
const AdminAdvertisementsPage = lazy(() => import('../admin/Advertisements/AdminAdvertisementsPage'));
const AdminSponsorsPage = lazy(() => import('../admin/Sponsors/AdminSponsorsPage'));
const AdminLedAnnouncementsPage = lazy(() => import('../admin/LedAnnouncements/AdminLedAnnouncementsPage'));
const AdminCommunityAnnouncementsPage = lazy(() => import('../admin/LedAnnouncements/AdminCommunityAnnouncementsPage'));
const AdminRecitationsPage = lazy(() => import('../admin/Recitations/AdminRecitationsPage'));
const AdminSocialPostsPage = lazy(() => import('../admin/SocialPosts/AdminSocialPostsPage'));
const AdminEventsPage = lazy(() => import('../admin/Events/AdminEventsPage'));
const AdminBookingsPage = lazy(() => import('../admin/Bookings/AdminBookingsPage'));
const AdminBookingDutiesPage = lazy(() => import('../admin/BookingDuties/AdminBookingDutiesPage'));
const AdminDonationsPage = lazy(() => import('../admin/Donations/AdminDonationsPage'));
const AdminUsersPage = lazy(() => import('../admin/Users/AdminUsersPage'));
const AdminRolesAccessPage = lazy(() => import('../admin/RolesAccess/AdminRolesAccessPage'));
const AdminNewsletterPage = lazy(() => import('../admin/Newsletter/AdminNewsletterPage'));
const AdminAuditTrailPage = lazy(() => import('../admin/AuditTrail/AdminAuditTrailPage'));

const LoadingFallback = () => <div className="py-20 text-center text-slate-600">Loading page...</div>;

const LIMITED_ADMIN_ROLES = [userRoles.SUPER_ADMIN, userRoles.ADMIN, userRoles.MEMBER, userRoles.VOLUNTEER, userRoles.FAMILY];
const ROLES_ACCESS_ALLOWED_ROLES = [userRoles.SUPER_ADMIN, userRoles.ADMIN];
const SUPER_ADMIN_ONLY_ROLES = [userRoles.SUPER_ADMIN];

const CustomCmsPage = lazy(() => import('../pages/CMS/CustomCmsPage'));

const AppRoutes = () => {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AutoReloadOnNewBuild />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/sikhism" element={<SikhismPage />} />
          <Route path="/gurbani-library" element={<GurbaniLibraryPage />} />
          <Route path="/hukamnama" element={<HukamnamaPage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/bookings" element={<BookingsPage />} />
          <Route path="/join" element={<Navigate to="/login?mode=join" replace />} />
          <Route path="/seva" element={<SevaPage />} />
          <Route path="/family-dashboard" element={<FamilyDashboardPage />} />
          <Route path="/donation" element={<DonationPage />} />
          <Route path="/kids-learning" element={<KidsLearningPage />} />
          <Route path="/media" element={<MediaPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/videos" element={<VideosPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="*" element={<CustomCmsPage />} />
        </Route>

        <Route path="/donationsuccess" element={<DonationSuccessPage />} />
        <Route path="/quick-donate" element={<QuickDonatePage />} />
        <Route path="/quick-donate-board" element={<LedEmergencyGuard><QuickDonateBoardPage /></LedEmergencyGuard>} />
        <Route path="/quick-donate/success" element={<QuickDonateSuccessPage />} />

        <Route path="/donation-board" element={<LedEmergencyGuard><DonationDisplayBoardPage /></LedEmergencyGuard>} />
        <Route path="/event-calendar-board" element={<LedEmergencyGuard><EventCalendarBoardPage /></LedEmergencyGuard>} />
        <Route path="/langar-board" element={<LedEmergencyGuard><LangarDisplayBoardPage /></LedEmergencyGuard>} />
        <Route path="/langar-contribute" element={<LangarItemContributionPage />} />
        <Route path="/daily-schedule-board" element={<LedEmergencyGuard><DailyScheduleDisplayBoardPage /></LedEmergencyGuard>} />
        <Route path="/led-boards" element={<LedEmergencyGuard><LedBoardLauncherPage /></LedEmergencyGuard>} />
        <Route path="/special-events-board" element={<LedEmergencyGuard><LedAnnouncementsBoardPage /></LedEmergencyGuard>} />
        <Route path="/community-announcements-board" element={<LedEmergencyGuard><CommunityAnnouncementsBoardPage /></LedEmergencyGuard>} />
        <Route path="/hukamnama-board" element={<LedEmergencyGuard><LedHukamnamaBoardPage /></LedEmergencyGuard>} />
        <Route path="/recitation-board" element={<LedEmergencyGuard><RecitationLedBoardPage /></LedEmergencyGuard>} />
        <Route path="/stream-overlay" element={<LedEmergencyGuard><StreamOverlayPage /></LedEmergencyGuard>} />
        <Route path="/follow" element={<RecitationFollowPage />} />
        <Route path="/follow/:sessionId" element={<RecitationFollowPage />} />
        <Route path="/granthi-remote" element={<GranthiRemotePage />} />
        <Route path="/ask-a-granthi" element={<LedEmergencyGuard><AskGranthiBoardPage /></LedEmergencyGuard>} />
        <Route path="/ask-a-granthi/question" element={<AskGranthiQuestionPage />} />

        <Route element={<ProtectedRoute allowedRoles={LIMITED_ADMIN_ROLES} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/cms" element={<AdminCmsPage />} />
            <Route path="/admin/news" element={<AdminNewsPage />} />
            <Route path="/admin/schedule" element={<AdminSchedulePage />} />
            <Route path="/admin/hukamnama" element={<AdminHukamnamaPage />} />
            <Route path="/admin/ask-granthi" element={<AdminAskGranthiPage />} />
            <Route element={<ProtectedRoute allowedRoles={SUPER_ADMIN_ONLY_ROLES} allowAssignedAdminAccess={false} />}>
              <Route path="/admin/gurdwara-branding" element={<AdminGurdwaraBrandingPage />} />
              <Route path="/admin/ask-granthi-branding" element={<Navigate to="/admin/gurdwara-branding" replace />} />
            </Route>
            <Route path="/admin/langar" element={<AdminLangarPage />} />
            <Route path="/admin/gallery" element={<AdminGalleryPage />} />
            <Route path="/admin/library" element={<AdminLibraryPage />} />
            <Route path="/admin/videos" element={<AdminVideosPage />} />
            <Route path="/admin/streaming" element={<AdminStreamingPage />} />
            <Route path="/admin/advertisements" element={<AdminAdvertisementsPage />} />
            <Route path="/admin/sponsors" element={<AdminSponsorsPage />} />
            <Route path="/admin/led-announcements" element={<AdminLedAnnouncementsPage />} />
            <Route path="/admin/community-announcements" element={<AdminCommunityAnnouncementsPage />} />
            <Route path="/admin/recitations" element={<AdminRecitationsPage />} />
            <Route path="/admin/social-posts" element={<AdminSocialPostsPage />} />
            <Route path="/admin/seva-opportunities" element={<AdminSevaOpportunitiesPage />} />
            <Route path="/admin/events" element={<AdminEventsPage />} />
            <Route path="/admin/bookings" element={<AdminBookingsPage />} />
            <Route path="/admin/booking-duties" element={<AdminBookingDutiesPage />} />
            <Route path="/admin/donations" element={<AdminDonationsPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/newsletter" element={<AdminNewsletterPage />} />
            <Route element={<ProtectedRoute allowedRoles={ROLES_ACCESS_ALLOWED_ROLES} allowAssignedAdminAccess={false} />}>
              <Route path="/admin/roles-access" element={<AdminRolesAccessPage />} />
            </Route>
            <Route path="/admin/audit-trail" element={<AdminAuditTrailPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

export default AppRoutes;
