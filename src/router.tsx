import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router';

import { AdminLayout, AdminSignIn } from '@/admin/layout';
import { AnnouncementsPage } from '@/admin/pages/announcements';
import { CarePage } from '@/admin/pages/care';
import { CheckinPage } from '@/admin/pages/checkin';
import { DashboardPage } from '@/admin/pages/dashboard';
import { EventsPage } from '@/admin/pages/events';
import { GivingPage } from '@/admin/pages/giving';
import { GroupsPage } from '@/admin/pages/groups';
import { ImportPage } from '@/admin/pages/import';
import { InsightsPage } from '@/admin/pages/insights';
import { MessagesPage } from '@/admin/pages/messages';
import { PeoplePage } from '@/admin/pages/people';
import { ServicesPage } from '@/admin/pages/services';
import { SettingsPage } from '@/admin/pages/settings';
import { VolunteersPage } from '@/admin/pages/volunteers';
import { Landing } from '@/landing';
import { MemberLayout, MemberSignIn } from '@/member/layout';
import { MemberEventPage, MemberEventsPage } from '@/member/pages/events';
import { MemberGivePage } from '@/member/pages/give';
import { MemberGroupsPage } from '@/member/pages/groups';
import { MemberHomePage } from '@/member/pages/home';
import { MemberDirectoryPage } from '@/member/pages/directory';
import { MemberMePage } from '@/member/pages/me';
import { MemberPrayerPage } from '@/member/pages/prayer';
import { MemberServingPage } from '@/member/pages/serving';

const routes = [
  { path: '/', element: <Landing /> },
  { path: '/admin/sign-in', element: <AdminSignIn /> },
  {
    path: '/admin',
    element: <AdminLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'people', element: <PeoplePage /> },
      { path: 'people/:id', element: <PeoplePage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'checkin', element: <CheckinPage /> },
      { path: 'volunteers', element: <VolunteersPage /> },
      { path: 'services', element: <ServicesPage /> },
      { path: 'groups', element: <GroupsPage /> },
      { path: 'giving', element: <GivingPage /> },
      { path: 'messages', element: <MessagesPage /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
      { path: 'care', element: <CarePage /> },
      { path: 'insights', element: <InsightsPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  { path: '/app/sign-in', element: <MemberSignIn /> },
  {
    path: '/app',
    element: <MemberLayout />,
    children: [
      { index: true, element: <MemberHomePage /> },
      { path: 'events', element: <MemberEventsPage /> },
      { path: 'events/:id', element: <MemberEventPage /> },
      { path: 'groups', element: <MemberGroupsPage /> },
      { path: 'give', element: <MemberGivePage /> },
      { path: 'serving', element: <MemberServingPage /> },
      { path: 'prayer', element: <MemberPrayerPage /> },
      { path: 'directory', element: <MemberDirectoryPage /> },
      { path: 'me', element: <MemberMePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

// The shareable preview build runs inside a frame where the URL can't change, so it routes in memory.
export const router = import.meta.env.VITE_PREVIEW === 'true' ? createMemoryRouter(routes) : createBrowserRouter(routes);
