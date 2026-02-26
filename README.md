## Document Management System (DMS)
A secure, full-stack web application for managing invoices and credit notes with AI-powered extraction, 3-step approval workflow, duplicate detection, and comprehensive reporting.

## 🚀 Live Demo
## Frontend: https://document-management-system-vercel.vercel.app

## Backend API: https://document-management-system-s76z.onrender.com

API Health Check: https://document-management-system-s76z.onrender.com/api/health

### 📋 Table of Contents
* Features

* Tech Stack

* System Architecture

* Role-Based Access Control

## Installation

Environment Variables

API Documentation

Deployment

Testing

Contributing

License

## ✨ Features
## 🔐 Authentication & Authorization
Secure JWT-based authentication

Role-based access control (Admin, Approver, Viewer)

User registration and login

Password encryption with bcrypt

## 📤 Document Upload
Dedicated upload page for invoices and credit notes

Support for PDF, JPEG, PNG formats

File size limit: 10MB

Vendor selection and creation

Automatic metadata extraction

## 🤖 AI-Powered Extraction
Google Cloud Vision API integration

Automatic extraction of:

Vendor name

Date

Amount

VAT

Invoice number

Confidence scoring

Fallback mock data when API is unavailable

## 🔄 3-Step Approval Workflow
Step	Role	Action
1	Reviewer	Approve / Reject
2	Manager	Approve / Reject
3	Finance/Admin	Final Approval
Status tracking (Pending, Approved, Rejected)

Approval history with comments

Real-time status updates

## 🔍 Duplicate Detection
Primary: Invoice number match against existing records

Secondary: Vendor + amount validation (within 1% tolerance)

Clear error messaging for duplicates

## 📊 Reports Module
Spend Summary - Overview of all spending

Vendor Analysis - Breakdown by vendor

Tax/VAT Report - Tax amounts and rates

Approval Status - Document workflow status

Filters:

Date range

Vendor name

Approval status

Amount range

Export Formats:

PDF

Excel

## 💡 AI Insights
Spending trends analysis

Anomaly detection

Vendor insights

Predictive analytics

Smart recommendations

## 🛠️ Tech Stack
## Frontend
Framework: React 18 with Vite

Routing: React Router v6

HTTP Client: Axios

Styling: Custom CSS

Charts: Chart.js

Icons: React Icons

Deployment: Vercel

## Backend
Runtime: Node.js

Framework: Express

Database: PostgreSQL

ORM: node-postgres (pg)

Authentication: JWT + bcrypt

File Upload: Multer

AI/OCR: Google Cloud Vision API

Reports: PDFKit, ExcelJS

Deployment: Render

Database
PostgreSQL with Neon (serverless)

Tables: users, vendors, documents, approvals, document_logs

## 🏗️ System Architecture
text
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend    │────▶│  Database   │
│   (Vercel)  │     │   (Render)   │     │   (Neon)    │
└─────────────┘     └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Google Cloud│
                    │ Vision API  │
                    └─────────────┘
## 👥 Role-Based Access Control
Feature	Viewer	Approver	Admin
View Dashboard	✅	✅	✅
View Documents	✅	✅	✅
Download Documents	✅	✅	✅
Upload Documents	❌	✅	✅
Approve Step 1	❌	✅	✅
Approve Step 2	❌	✅	✅
Approve Step 3	❌	❌	✅
View Approvals	❌	✅	✅
Generate Reports	❌	✅	✅
Export Reports	❌	✅	✅
View AI Insights	✅	✅	✅
Manage Users	❌	❌	✅
## 📦 Installation
Prerequisites
Node.js (v18 or higher)

PostgreSQL (or Neon account)

Google Cloud account (for Vision API)

Git

Clone Repository
text
git clone https://github.com/Qhaweisthename/Document-management-system.git
cd Document-management-system
Backend Setup
text
cd server
npm install

# Create .env file
cp .env.example .env
# Edit .env with your database credentials

# Run database migrations
npm run db:create
npm run db:seed

# Start development server
npm run dev
Frontend Setup
text
cd client/dms-frontend
npm install

# Create .env file
cp .env.example .env
# Add your backend URL

# Start development server
npm run dev
🔧 Environment Variables
Backend (.env)
text
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=document_management

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRE=7d

# Google Cloud Vision (Base64 encoded credentials)
GOOGLE_APPLICATION_CREDENTIALS_BASE64=your_base64_credentials

# CORS
CLIENT_URL=http://localhost:5173
Frontend (.env)
text
VITE_API_URL=http://localhost:5000/api
## 📚 API Documentation
Authentication Endpoints
Method	Endpoint	Description
POST	/api/auth/register	Register new user
POST	/api/auth/login	Login user
GET	/api/auth/me	Get current user
PUT	/api/auth/change-password	Change password
Document Endpoints
Method	Endpoint	Description
GET	/api/documents/all	Get all documents
GET	/api/documents/my-uploads	Get user's uploads
POST	/api/documents/upload	Upload document
GET	/api/documents/download/:id	Download document
GET	/api/documents/vendors	Get vendors
POST	/api/documents/vendors	Create vendor
GET	/api/documents/workflow/:id	Get workflow status
Approval Endpoints
Method	Endpoint	Description
GET	/api/approvals/pending	Get pending approvals
GET	/api/approvals/history/:documentId	Get approval history
PUT	/api/approvals/:id	Process approval
GET	/api/approvals/stats	Get approval statistics
Report Endpoints
Method	Endpoint	Description
POST	/api/reports/generate	Generate report
POST	/api/reports/export/excel	Export to Excel
POST	/api/reports/export/pdf	Export to PDF
## 🚀 Deployment
Backend (Render)
Push code to GitHub

Create new Web Service on Render

Connect repository

Set environment variables

## Deploy

Frontend (Vercel)
text
cd client/dms-frontend
npm install -g vercel
vercel login
vercel --prod
🧪 Testing
Test Credentials
text
Admin:
  Email: admin@demo.com
  Password: password123

Approver:
  Email: approver@demo.com
  Password: password123

Viewer:
  Email: viewer@demo.com
  Password: password123
Test the Workflow
Login as Admin/Approver

Upload a test invoice

Login as Approver to approve Step 1

Login as Admin for final approval

Check document status

Generate reports

🤝 Contributing
Fork the repository

Create feature branch (git checkout -b feature/AmazingFeature)

Commit changes (git commit -m 'Add some AmazingFeature')

Push to branch (git push origin feature/AmazingFeature)

Open a pull request

📄 License
This project is licensed under the MIT License.

👨‍💻 Author
Qhawe

GitHub: @Qhaweisthename

🙏 Acknowledgments
Google Cloud Vision API for OCR capabilities

Render for hosting

Vercel for frontend deployment

Neon for serverless PostgreSQL
