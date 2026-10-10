import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DiscoveryPage from './pages/DiscoveryPage';
import SignupPage from './pages/auth/SignupPage';
import LoginPage from './pages/auth/LoginPage';
import VerifyEmailPage from './pages/auth/VerifyEmailPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import ActivityDetailsPage from './pages/activities/ActivityDetailsPage';
import CreateActivityPage from './pages/activities/CreateActivityPage';
import MyPlansPage from './pages/plans/MyPlansPage';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DiscoveryPage />} />
          <Route path="/plans" element={<MyPlansPage />} />
          <Route path="/create" element={<CreateActivityPage />} />
          <Route path="/activities/create" element={<CreateActivityPage />} />
          <Route path="/activities/:id" element={<ActivityDetailsPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/register" element={<SignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="*" element={<DiscoveryPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
