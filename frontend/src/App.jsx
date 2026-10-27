import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { LangProvider } from './contexts/LangContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Home from './pages/Home.jsx'
import Firewall from './pages/Firewall.jsx'
import Csl from './pages/Csl.jsx'
import Employees from './pages/Employees.jsx'
import Projects from './pages/Projects.jsx'
import Reports from './pages/Reports.jsx'
import Users from './pages/Users.jsx'
import LoginHistory from './pages/LoginHistory.jsx'
import Echeances from './pages/Echeances.jsx'
import Delibera from './pages/Delibera.jsx'
import DeliberaForms from './pages/DeliberaForms.jsx'
import AuditForms from './pages/AuditForms.jsx'
import AuditProduit from './pages/AuditProduit.jsx'
import TriPage from './pages/TriPage.jsx'
import Profile from './pages/Profile.jsx'
import Targets from './pages/Targets.jsx'
import SuiviQualite from './pages/SuiviQualite.jsx'
import SuiviQualiteStats from './pages/SuiviQualiteStats.jsx'
import SuiviQualitePublic from './pages/SuiviQualitePublic.jsx'
import SuiviQualiteShift from './pages/SuiviQualiteShift.jsx'
import DefautCouturiere from './pages/DefautCouturiere.jsx'
import BarcodeErrorDialog from './components/BarcodeErrorDialog.jsx'


function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

function ProjectsRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('projects', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function UsersRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('users', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function EmployeesRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('operators', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function TargetsRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('target', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function SuiviQualiteRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('suivi_qualite', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function DefautCouturiereRoute({ children }) {
  const { token, can } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!can('defauts_couturiere', 'read')) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function PermissionsRoute({ children }) {
  const { token, isAdmin } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/home" replace />
  return <Layout>{children}</Layout>
}

function AppRoutes() {
  const { token } = useAuth()
  return (
    <Routes>
      <Route path="/login"                  element={token ? <Navigate to="/home" replace /> : <Login />} />
      <Route path="/affichage-qualite"      element={<SuiviQualitePublic />} />
      <Route path="/home"                   element={<PrivateRoute><Home /></PrivateRoute>} />
      <Route path="/firewall"               element={<PrivateRoute><Firewall /></PrivateRoute>} />
      <Route path="/csl"                    element={<PrivateRoute><Csl /></PrivateRoute>} />
      <Route path="/delibera"              element={<PrivateRoute><Delibera /></PrivateRoute>} />
      <Route path="/delibera-dashboard"     element={<Navigate to="/home?tab=delibera" replace />} />
      <Route path="/delibera-forms"        element={<PrivateRoute><DeliberaForms /></PrivateRoute>} />
      <Route path="/audit-forms"           element={<PrivateRoute><AuditForms /></PrivateRoute>} />
      <Route path="/audit-produit"          element={<PrivateRoute><AuditProduit /></PrivateRoute>} />
      <Route path="/audit-produit/:id"      element={<PrivateRoute><AuditProduit /></PrivateRoute>} />
      <Route path="/echeances"              element={<PrivateRoute><Echeances /></PrivateRoute>} />
      <Route path="/echeances/:projetCode"  element={<PrivateRoute><Echeances /></PrivateRoute>} />
      <Route path="/tri"                     element={<PrivateRoute><TriPage /></PrivateRoute>} />
      <Route path="/reports"                element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/employees"              element={<EmployeesRoute><Employees /></EmployeesRoute>} />
      <Route path="/projects"               element={<ProjectsRoute><Projects /></ProjectsRoute>} />
      <Route path="/targets"                element={<TargetsRoute><Targets /></TargetsRoute>} />
      <Route path="/targets/:id"            element={<TargetsRoute><Targets /></TargetsRoute>} />
      <Route path="/suivi-qualite"          element={<SuiviQualiteRoute><SuiviQualite /></SuiviQualiteRoute>} />
      <Route path="/suivi-qualite/stats"    element={<SuiviQualiteRoute><SuiviQualiteStats /></SuiviQualiteRoute>} />
      <Route path="/suivi-qualite/shift"    element={<SuiviQualiteRoute><SuiviQualiteShift /></SuiviQualiteRoute>} />
      <Route path="/defauts-couturiere"     element={<DefautCouturiereRoute><DefautCouturiere /></DefautCouturiereRoute>} />
      <Route path="/users"                  element={<UsersRoute><Users /></UsersRoute>} />
      <Route path="/login-history/:id"      element={<UsersRoute><LoginHistory /></UsersRoute>} />
      <Route path="/login-history"          element={<PermissionsRoute><LoginHistory /></PermissionsRoute>} />
      <Route path="/profile"               element={<PrivateRoute><Profile /></PrivateRoute>} />
      <Route path="*"                       element={<Navigate to="/home" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
          <BarcodeErrorDialog />
        </BrowserRouter>
      </AuthProvider>
    </LangProvider>
  )
}