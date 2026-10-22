import { createBrowserRouter, createMemoryRouter, Navigate } from 'react-router';

import { AdminLayout, AdminSignIn } from '@/admin/layout';
import { AnnouncementsPage } from '@/admin/pages/announcements';
import { DashboardPage } from '@/admin/pages/dashboard';
import { EventsPage } from '@/admin/pages/events';
import { GivingPage } from '@/admin/pages/giving';
import { GroupsPage } from '@/admin/pages/groups';
import { ImportPage } from '@/admin/pages/import';
import { PeoplePage } from '@/admin/pages/people';
import { SettingsPage } from '@/admin/pages/settings';
import { Landing } from '@/landing';
import { MemberLayout, MemberSignIn } from '@/member/layout';
import { MemberEventPage, MemberEventsPage } from '@/member/pages/events';
import { MemberGivePage } from '@/member/pages/give';
import { MemberGroupsPage } from '@/member/pages/groups';
import { MemberHomePage } from '@/member/pages/home';
import { MemberMePage } from '@/member/pages/me';

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
      { path: 'groups', element: <GroupsPage /> },
      { path: 'giving', element: <GivingPage /> },
      { path: 'announcements', element: <AnnouncementsPage /> },
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
      { path: 'me', element: <MemberMePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
];

// The shareable preview build runs inside a frame where the URL can't change, so it routes in memory.
export const router = import.meta.env.VITE_PREVIEW === 'true' ? createMemoryRouter(routes) : createBrowserRouter(routes);
