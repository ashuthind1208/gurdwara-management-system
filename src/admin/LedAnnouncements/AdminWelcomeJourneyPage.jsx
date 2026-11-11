import WelcomeJourneyAdminCard from './WelcomeJourneyAdminCard';

const AdminWelcomeJourneyPage = () => <div className="space-y-5">
  <header className="rounded-2xl bg-gradient-to-r from-[#123760] to-[#287983] p-6 text-white">
    <h1 className="font-heading text-3xl font-bold">Sangat Welcome Journey</h1>
    <p className="mt-2 text-sm text-cyan-50">Manage your visitor guide, lobby QR board, reusable Langar dishes, and optional follow-up requests in one place.</p>
  </header>
  <WelcomeJourneyAdminCard />
</div>;

export default AdminWelcomeJourneyPage;