import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from "./components/ui/tooltip";
import { AuthProvider } from './contexts/AuthContext';
import { DashboardProvider } from './contexts/DashboardContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';

// Lazy load heavy pages
const Dashboard = lazy(() => import('./pages/DashboardNew'));
const Sources = lazy(() => import('./pages/Sources'));
const ContentFeed = lazy(() => import('./pages/ContentFeed'));
const YouTubeMonitor = lazy(() => import('./pages/YouTubeMonitor'));
const XMonitor = lazy(() => import('./pages/XMonitor'));
const FacebookMonitor = lazy(() => import('./pages/FacebookMonitor'));
const InstagramMonitor = lazy(() => import('./pages/InstagramMonitor'));
const InstagramProfile = lazy(() => import('./pages/InstagramProfile'));
const Grievances = lazy(() => import('./pages/Grievances'));
const Alerts = lazy(() => import('./pages/Alerts'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const ActiveThreats = lazy(() => import('./pages/ActiveThreats'));
const Surveillance = lazy(() => import('./pages/Surveillance'));
const IntelProcessed = lazy(() => import('./pages/IntelProcessed'));
const CaseReports = lazy(() => import('./pages/CaseReports'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const HelpGuide = lazy(() => import('./pages/HelpGuide'));
const GlobalSearch = lazy(() => import('./pages/GlobalSearch'));
const Events = lazy(() => import('./pages/Events'));
const Announcements = lazy(() => import('./pages/Announcements'));
const Reports = lazy(() => import('./pages/Reports'));
const GenerateReport = lazy(() => import('./pages/GenerateReport'));
const Dial100IncidentReporting = lazy(() => import('./pages/Dial100IncidentReporting'));
const UnifiedMonitors = lazy(() => import('./pages/UnifiedMonitors'));
const UnifiedReports = lazy(() => import('./pages/UnifiedReports'));
const IntelligenceDashboard = lazy(() => import('./pages/IntelligenceDashboard'));
const PolicyManager = lazy(() => import('./components/PolicyManager'));
const PersonOfInterest = lazy(() => import('./pages/POI/PersonOfInterest'));
const POIDetail = lazy(() => import('./pages/POI/POIDetail'));
const AccessManagement = lazy(() => import('./pages/AccessManagement'));
const DeepfakeAnalysis = lazy(() => import('./pages/Deepfake/DeepfakeAnalysis'));
const Telegram = lazy(() => import('./pages/Telegram'));
const AnalysisTools = lazy(() => import('./pages/AnalysisTools'));
const DarkWebSearch = lazy(() => import('./pages/DarkWebSearch'));
const PublicWebArticles = lazy(() => import('./pages/PublicWebArticles'));
const EventsReport = lazy(() => import('./pages/EventsReport'));
const TelanganaMap = lazy(() => import('./pages/TelanganaMap'));

// ── Geographic & constituency intelligence ────────────────────────
const GeographicIntelligence = lazy(() => import('./pages/GeographicIntelligence'));
const GeographicIntelligenceDistrict = lazy(() => import('./pages/GeographicIntelligenceDistrict'));
const CommandCentre = lazy(() => import('./pages/AndhraPradeshMap'));
const MlaProfile = lazy(() => import('./pages/MlaProfile'));
const ConstituencyLogins = lazy(() => import('./pages/ConstituencyLogins'));
const SearchAnalytics = lazy(() => import('./pages/SearchAnalytics'));
const UnrestPredictor = lazy(() => import('./pages/UnrestPredictor'));
// Loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[400px]">
    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
  </div>
);

import { NotificationProvider } from './context/NotificationContext';
import { InstagramCacheProvider } from './contexts/InstagramCacheContext';
import { RbacProvider } from './contexts/RbacContext';
import { PoliticianNavigationProvider } from './contexts/PoliticianNavigationContext';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <DashboardProvider>
        <NotificationProvider>
          <BrowserRouter>
            <RbacProvider>
            <InstagramCacheProvider>
              <Toaster position="top-right" expand={true} richColors />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <PoliticianNavigationProvider>
                          <Layout />
                        </PoliticianNavigationProvider>
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="/dashboard" replace />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="telangana-map" element={<TelanganaMap />} />
                    {/* Executive command centre — the ported AP.Blura.Saga map dashboard */}
                    <Route path="command-centre" element={<CommandCentre />} />
                    <Route path="geographic-intelligence" element={<GeographicIntelligence />} />
                    <Route path="geographic-intelligence/:districtKey" element={<GeographicIntelligenceDistrict />} />
                    <Route path="mla/:constituency" element={<MlaProfile />} />
                    <Route path="constituency-logins" element={<ConstituencyLogins />} />
                    <Route path="search-analytics" element={<SearchAnalytics />} />
                    <Route path="unrest-predictor" element={<UnrestPredictor />} />
                    {/* AP-era paths kept so old bookmarks/links do not 404 */}
                    <Route path="andhra-pradesh-map" element={<Navigate to="/command-centre" replace />} />
                    <Route path="war-room" element={<Navigate to="/command-centre" replace />} />
                    <Route path="sources" element={<Sources />} />
                    <Route path="content" element={<ContentFeed />} />
                    <Route path="youtube-monitor" element={<YouTubeMonitor />} />
                    <Route path="x-monitor" element={<XMonitor />} />
                    <Route path="facebook-monitor" element={<FacebookMonitor />} />
                    <Route path="instagram-monitor" element={<InstagramMonitor />} />
                    <Route path="instagram-monitor/:sourceId" element={<InstagramProfile />} />
                    <Route path="monitors" element={<UnifiedMonitors />} />
                    <Route path="grievances" element={<Grievances />} />
                    <Route path="alerts" element={<Alerts />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="global-search" element={<GlobalSearch />} />
                    <Route path="events" element={<Events />} />
                    <Route path="announcements" element={<Announcements />} />
                    <Route path="unified-reports" element={<UnifiedReports />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="intelligence-dashboard" element={<IntelligenceDashboard />} />
                    <Route path="policies" element={<PolicyManager />} />
                    <Route path="active-threats" element={<ActiveThreats />} />
                    <Route path="surveillance" element={<Surveillance />} />
                    <Route path="intel-processed" element={<IntelProcessed />} />
                    <Route path="case-reports" element={<CaseReports />} />
                    <Route path="reports" element={<Reports />} />
                    <Route path="reports/generate/:id" element={<GenerateReport />} />
                    <Route path="dial-100-incident-reporting" element={<Dial100IncidentReporting />} />
                    <Route path="audit-logs" element={<AuditLogs />} />
                    <Route path="access-management" element={<AccessManagement />} />
                    <Route path="person-of-interest" element={<PersonOfInterest />} />
                    <Route path="person-of-interest/:id" element={<POIDetail />} />
                    <Route path="deepfake-analysis" element={<DeepfakeAnalysis />} />
                    <Route path="telegram" element={<Telegram />} />
                    <Route path="analysis-tools" element={<AnalysisTools />} />
                    <Route path="dark-web-search" element={<DarkWebSearch />} />
                    <Route path="public-web-articles" element={<PublicWebArticles />} />
                    <Route path="deepfake/forensics" element={<DeepfakeAnalysis />} />
                    <Route path="events-report" element={<EventsReport />} />
                    <Route path="help" element={<HelpGuide />} />
                  </Route>
                </Routes>
              </Suspense>
            </InstagramCacheProvider>
            </RbacProvider>
          </BrowserRouter>
        </NotificationProvider>
      </DashboardProvider>
    </AuthProvider>
  );
}

export default App;
