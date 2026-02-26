import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/authContext";

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Role-based navigation items
  const navItems = [
    { path: "/dashboard", label: "Dashboard", roles: ["admin", "approver", "viewer"] },
    { path: "/upload", label: "Upload", roles: ["admin", "approver"] },
    { path: "/documents", label: "Documents", roles: ["admin", "approver", "viewer"] },
    { path: "/approvals", label: "Approvals", roles: ["admin", "approver"] },
    { path: "/reports", label: "Reports", roles: ["admin", "approver"] },
    { path: "/insights", label: "AI Insights", roles: ["admin", "approver", "viewer"] },
  ];

  // Filter items based on user role
  const filteredNavItems = navItems.filter(item => 
    item.roles.includes(user?.role)
  );

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>DMS System</h1>
        </div>

        <nav className="sidebar-nav">
          {filteredNavItems.map((item) => (
            <Link key={item.path} to={item.path}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <h4>{user?.username || 'User'}</h4>
              <span className="user-role">{user?.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-left">
            <span>Welcome, <strong>{user?.username || 'User'}</strong></span>
            <span className="user-role-badge">({user?.role})</span>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            Logout
          </button>
        </header>

        {/* Page Content */}
        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}