import { Link } from "react-router-dom";

export default function Layout({ children }) {
  const role = "admin"; // Replace with context later

  return (
    <div className="flex h-screen bg-gray-100">
      
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white p-5 space-y-4">
        <h1 className="text-xl font-bold mb-6">DMS System</h1>

        <Link to="/dashboard" className="block hover:text-blue-400">Dashboard</Link>
        <Link to="/upload" className="block hover:text-blue-400">Upload</Link>
        <Link to="/documents" className="block hover:text-blue-400">Documents</Link>

        {(role === "admin" || role === "approver") && (
          <Link to="/approvals" className="block hover:text-blue-400">Approvals</Link>
        )}

        <Link to="/reports" className="block hover:text-blue-400">Reports</Link>
        <Link to="/insights" className="block hover:text-blue-400">AI Insights</Link>

        {role === "admin" && (
          <Link to="/users" className="block hover:text-blue-400">Users</Link>
        )}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        
        {/* Navbar */}
        <div className="bg-white shadow p-4 flex justify-between">
          <span>Welcome, Admin</span>
          <button className="text-red-500">Logout</button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-auto">
          {children}
        </div>

      </div>
    </div>
  );
}