import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/authContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import Documents from "./pages/Documents";
import Approvals from "./pages/Approvals";
import Reports from "./pages/Reports";
import Insights from "./pages/Insights"; // Import Insights page
import "./App.css";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <Layout>
                <Navigate to="/dashboard" replace />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/upload" element={
            <ProtectedRoute allowedRoles={['admin', 'approver']}>
              <Layout>
                <Upload />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/documents" element={
            <ProtectedRoute>
              <Layout>
                <Documents />
              </Layout>
            </ProtectedRoute>
          } />
          
          <Route path="/approvals" element={
            <ProtectedRoute allowedRoles={['admin', 'approver']}>
              <Layout>
                <Approvals />
              </Layout>
            </ProtectedRoute>
          } />

          <Route path="/reports" element={
            <ProtectedRoute allowedRoles={['admin', 'approver']}>
              <Layout>
                <Reports />
              </Layout>
            </ProtectedRoute>
          } />

          {/* Add the Insights route */}
          <Route path="/insights" element={
            <ProtectedRoute allowedRoles={['admin', 'approver', 'viewer']}>
              <Layout>
                <Insights />
              </Layout>
            </ProtectedRoute>
          } />
          
          {/* Catch all - redirect to login */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;