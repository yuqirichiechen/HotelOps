# HotelOps: Integrated Workforce Management Platform
## Revised 3-Quarter Capstone Project Plan

**Student:** Richie Chen  
**Faculty Adviser:** Professor Wooyoung Kim  
**Company Sponsor:** Snoqualmie Inn  
**Duration:** Spring 2026 (5cr) + Summer 2026 (3cr) + Fall 2026 (2cr) = 10 credits  
**Presentation Date:** December 12, 2026 (Fall Colloquium)

---

## REVISED PROJECT DESCRIPTION

### Overview
HotelOps is a full-stack hotel operations management platform that modernizes manual Excel-based workflows into an integrated web application with role-based access control, AI-powered natural language querying, and real-time analytics. The system replaces fragmented processes for shift communication, time tracking, payroll management, and room forecasting while demonstrating advanced competencies in full-stack development, authentication/authorization, AI/ML integration, and data engineering.

### Core Modules

#### 1. Authentication & Schedule Management System
- **Multi-role authentication:** Employee, Front Desk, Admin roles with JWT-based session management
- **Schedule creation & assignment:** Admins create/assign shifts, replacing Excel + group chat workflow
- **Employee self-service portal:** Web/mobile-responsive interface to view schedules, timesheets, shift notes
- **Automated notifications:** Email/in-app alerts for new schedules, shift changes, important notes

#### 2. Time Tracking & Payroll System
- **Web-based clock-in/out:** Phone number authentication for quick access, replaces punch cards
- **Automated time aggregation:** Calculate hours by day/week/month/year with timezone handling
- **Overtime detection & calculation:** Automatic flagging when approaching/exceeding 40hrs/week
- **Manager approval workflows:** All manual time edits require manager approval with audit trail
- **Payroll calculation engine:** Configurable base hourly rates, automatic pay period calculations
- **CSV export system:** Flexible reports (daily/weekly/monthly/yearly) for external payroll processing

#### 3. Room Forecasting & Analytics Dashboard
- **Web scraper integration:** Automated data extraction from hotel property management system (PMS)
- **Daily room forecasting:** Calculate room surplus/shortage by type (Standard, Deluxe, Suite, etc.)
- **Front desk access:** Role-specific visibility (only Front Desk + Admin can view forecasting)
- **Labor cost analytics:** Visualize staffing costs vs. revenue, overtime trends, cost per occupied room
- **Performance dashboards:** Real-time KPIs including labor cost %, overtime hours, peak staffing patterns

#### 4. Shift Communication with Role-Based Filtering
- **Department-specific shift notes:** Create notes tagged by department (Front Desk, Housekeeping, Maintenance, etc.)
- **Admin-controlled visibility:** Managers assign which roles can see which note categories
- **Scheduled notifications:** Future-dated alerts with configurable advance warnings (e.g., "alert 1 day before event")
- **Searchable note history:** Full-text search across all shift handoff notes with date range filtering

#### 5. AI Query System (RAG + LLM)
- **Dual chatbot interfaces:**
  - **Employee Bot:** Scoped to user's own data only ("How many hours did I work last week?", "When is my next shift?")
  - **Admin Bot:** Access to all employee data ("Who worked overtime this month?", "What's John's total hours in Q2?")
- **Data isolation at query level:** Vector store filtered by user role before LLM retrieval
- **Technology stack:** Small LLM (Llama 3.2 1B or Phi-3-mini), sentence-transformers for embeddings, FAISS/ChromaDB vector database
- **Natural language capabilities:** Handle complex multi-part queries, date range calculations, aggregations

---

## ACADEMIC MERIT & COMPETENCIES

This project extends the following CSS core and advanced technical competencies:

### **Software Development Processes & Methodologies** (CSS 360)
Agile development with weekly sprints, continuous integration/deployment pipelines (GitHub Actions), code reviews, version control best practices, and iterative feature delivery across three quarters. Application of life-cycle models for a production-ready system.

### **Analysis and Design** (CSS 370)
Comprehensive requirements analysis through stakeholder interviews (hotel manager, front desk staff, housekeeping). UML modeling including use case diagrams for each user role, class diagrams for domain models, sequence diagrams for authentication flow and API interactions, and ER diagrams for database schema design. Application of object-oriented design principles and separation of concerns.

### **Database Design & Implementation** (CSS 475)
Design normalized relational schema (BCNF) for users, roles, departments, shifts, schedules, time_entries, shift_notes, room_types, forecasts, and audit_logs. Implement complex queries including recursive CTEs for shift coverage chains, window functions for running totals and overtime calculations, and optimized indexing strategies for large datasets. Advanced PostgreSQL features including triggers for audit logging, stored procedures for payroll calculations, and materialized views for analytics dashboards.

### **Data Structures & Algorithms** (CSS 342, CSS 343)
Hash tables for O(1) employee lookup by phone number during clock-in. Priority queues for notification scheduling system. Tree structures for hierarchical department organization. Graph algorithms for potential shift swap/coverage optimization. Algorithm analysis to optimize time aggregation queries and forecast calculations at scale.

### **Web Programming and Full-Stack Development** (CSS 481)
Complete MERN-style stack (React frontend, Node.js/Express backend, PostgreSQL database). Client-side state management with React Context/Redux. RESTful API design with proper HTTP semantics, versioning, pagination, and rate limiting. WebSocket integration for real-time notifications. Server-side rendering considerations for mobile performance. Responsive design with mobile-first approach for employee portal.

### **Artificial Intelligence & Machine Learning** (CSS 382, CSS 486)
Retrieval-Augmented Generation (RAG) system architecture with vector embeddings using sentence-transformers. Integration of small language models (Llama 3.2 1B or Phi-3-mini) for natural language understanding. Vector similarity search with FAISS/ChromaDB. Prompt engineering for role-scoped queries and data isolation. Evaluation metrics for RAG quality (relevance, hallucination detection, answer accuracy).

### **Security & Data Protection** (CSS 477)
Role-based access control (RBAC) with hierarchical permissions. JWT authentication with refresh token rotation. Password hashing with bcrypt. SQL injection prevention through parameterized queries. XSS and CSRF protection. Audit logging for all privileged operations (time edits, schedule changes, role assignments). PII data protection compliance (employee SSNs, salaries). Secure API design including rate limiting and input validation.

### **Operating Systems & Concurrency** (CSS 430)
Concurrent request handling with Node.js event loop. Database connection pooling for performance. Background job scheduling (cron jobs for daily forecasting scraper). Race condition prevention in time clock-in/out operations. Transaction management for payroll calculations requiring atomic operations across multiple tables.

### **Network Design & API Integration** (CSS 432)
RESTful API design principles with proper HTTP status codes, error handling, and API documentation (Swagger/OpenAPI). Rate limiting and throttling strategies. CORS configuration for frontend-backend separation. WebSocket protocol for real-time features. Web scraping with HTTP client libraries (Axios) and headless browser automation (Puppeteer).

### **Data Integration & ETL** (Applied from CSS 475)
Web scraper for property management system data extraction. HTML/JSON parsing with Cheerio/Puppeteer. Data transformation and validation pipelines. Scheduled ETL jobs with error handling and retry logic. Data quality monitoring and anomaly detection for forecasting accuracy.

### **Software Testing & Quality Assurance** (CSS 360)
Unit testing for backend logic (Jest for payroll calculations, overtime detection, time aggregation). Integration testing for API endpoints (Supertest). End-to-end testing for critical workflows (Cypress for clock-in/out, schedule viewing). Component testing for React UI (React Testing Library). Test-driven development (TDD) practices with 80%+ code coverage target. Performance testing for database queries under load.

### **Project Management** (CSS 350, CSS 461)
Risk analysis and mitigation strategies (scope creep, technical challenges, deployment issues). Stakeholder communication (bi-weekly meetings with faculty adviser, monthly demos with hotel manager). Resource allocation across three quarters. Sprint planning and retrospectives. Change management process for feature requests. Documentation and knowledge transfer.

---

## THREE-QUARTER DEVELOPMENT TIMELINE

### **SPRING 2026 (5 credits) - Foundation & Core Features**

#### Week 1-2: Infrastructure & Authentication (March 30 - April 12)
**Goals:** Set up development environment, database, and authentication system

**Deliverables:**
- GitHub repository with CI/CD pipeline (GitHub Actions)
- PostgreSQL database deployed (AWS RDS or Supabase)
- Database schema design completed (ERD diagram, normalized to BCNF)
  - Tables: users, roles, departments, shifts, schedules, time_entries, shift_notes
- Serverless backend deployed (AWS Lambda + API Gateway or Vercel)
- JWT authentication implementation with refresh tokens
- Role-based middleware (Employee/Front Desk/Admin)
- Login/logout API endpoints with proper error handling

**Weekly Status Report Items:**
- Attended Winter 2026 Capstone Colloquium ✓
- Finalized requirements with hotel manager ✓
- Set up dev environment (Node.js v20, React 18, PostgreSQL 16) ✓
- Created GitHub repo with initial scaffolding ✓

---

#### Week 3-5: Employee Portal - Phase 1 (April 13 - May 3)
**Goals:** Build employee-facing features (clock-in/out, view schedule, view timesheet)

**Deliverables:**
- **Clock-in/out interface:**
  - Phone number entry field with validation
  - Clock-in/out button with loading states
  - Success/error notifications
  - Mobile-responsive design
- **View schedule page:**
  - Calendar view of upcoming shifts
  - Shift details (date, time, department)
  - Filter by date range
- **View timesheet page:**
  - Table of clock-in/out records
  - Daily/weekly hour totals
  - Current pay period summary
- **Backend API endpoints:**
  - POST /api/time/clock-in
  - POST /api/time/clock-out
  - GET /api/schedule/my-shifts
  - GET /api/time/my-timesheet
- Unit tests for time tracking logic (timezone handling, overlap detection)

**Technical Challenges:**
- Timezone handling (store UTC, display local)
- Duplicate clock-in prevention
- Missed clock-out detection (shift ended but no clock-out)

---

#### Week 6-8: Admin Portal - Phase 1 (May 4 - May 24)
**Goals:** Build admin-facing features (user management, schedule creation, shift notes)

**Deliverables:**
- **User management interface:**
  - Create/edit/deactivate employees
  - Assign roles (Employee, Front Desk, Admin)
  - Assign departments
  - Set base hourly rate
- **Schedule creation interface:**
  - Create shifts (date, start time, end time, department)
  - Assign employee to shift
  - Bulk schedule import (CSV upload)
  - Schedule templates (recurring shifts)
- **Shift notes management:**
  - Create shift notes with department tags
  - Set visibility by role/department
  - Schedule future notifications
  - Search/filter past notes
- **Backend API endpoints:**
  - POST /api/admin/users
  - PUT /api/admin/users/:id
  - POST /api/admin/schedules
  - POST /api/admin/shift-notes
  - GET /api/shift-notes (role-filtered)

**Integration Work:**
- Notification system (email via SendGrid or in-app)
- Scheduled job system (node-cron for future alerts)

---

#### Week 9-10: Time Aggregation & Payroll Foundation (May 25 - June 7)
**Goals:** Implement automated hour calculations and basic payroll

**Deliverables:**
- **Time aggregation engine:**
  - Daily hour calculation (clock-in to clock-out duration)
  - Weekly hour totals (Sunday-Saturday pay periods)
  - Monthly and yearly totals
  - SQL queries with window functions for running totals
- **Basic payroll calculation:**
  - Regular hours * base hourly rate
  - Display total pay for period
  - No overtime logic yet (coming in Summer)
- **Admin timesheet view:**
  - View all employee timesheets
  - Filter by employee, department, date range
  - Export to CSV (basic version)
- **Database optimization:**
  - Indexes on frequently queried columns (user_id, clock_in_time)
  - Query performance testing with sample data (10k+ time entries)

**End-of-Quarter Deliverables:**
- Spring quarter status report to faculty adviser
- Demo to hotel manager (employee portal + admin basics)
- Updated GitHub repository with commit history
- Test coverage report (target: 70%+)

---

### **SUMMER 2026 (3 credits) - Advanced Features & AI**

#### Week 1-2: Overtime & Approval Workflows (June 22 - July 5)
**Goals:** Add overtime detection, manager approval system, enhanced CSV exports

**Deliverables:**
- **Overtime detection:**
  - Automatic flagging when approaching 40 hours/week
  - Overtime rate calculation (1.5x base rate for hours > 40)
  - Dashboard alert for managers ("5 employees approaching overtime")
- **Manager approval workflow:**
  - Manual time edit requests (employee or manager-initiated)
  - Approval/rejection interface for managers
  - Audit log table (who changed what, when, why, approval status)
  - Email notifications for pending approvals
- **Enhanced CSV export:**
  - Multiple export formats (daily, weekly, monthly, yearly)
  - Customizable column selection
  - Include overtime breakdown, department, base rate, total pay
  - Export format compatible with QuickBooks/ADP

**Database Changes:**
- Add overtime_hours column to time_entries
- Create approval_requests table (request_id, employee_id, original_time, edited_time, reason, approver_id, status, timestamp)
- Create audit_log table for all changes

---

#### Week 3-4: Web Scraper & Room Forecasting (July 6 - July 19)
**Goals:** Build web scraper for PMS data and forecasting dashboard

**Deliverables:**
- **Web scraper implementation:**
  - Puppeteer script to log into PMS system
  - Extract room data (room type, status: vacant/clean/dirty, check-ins today)
  - Parse HTML tables or JSON API responses
  - Error handling (login failures, timeouts, data format changes)
  - Configurable scraper (manual trigger or scheduled cron job)
- **Room forecast calculation:**
  - Count available rooms by type (vacant + clean)
  - Count expected check-ins by room type
  - Calculate surplus/shortage: available - expected
  - Store results in forecasts table with timestamp
- **Forecasting dashboard (Front Desk + Admin only):**
  - Display current forecast (rooms available, check-ins expected, surplus/shortage)
  - Color-coded alerts (green = surplus, red = shortage)
  - Historical forecast data (trend chart)
  - Manual refresh button + last update timestamp
- **Backend API:**
  - POST /api/forecast/scrape (trigger scraper manually)
  - GET /api/forecast/current
  - GET /api/forecast/history?days=30

**Technical Challenges:**
- PMS system may require CAPTCHA (consider using 2captcha service or fallback to manual data entry)
- Data format changes require robust parsing with fallback
- Web scraping legality - confirm with hotel that this is acceptable use

---

#### Week 5-8: RAG System & AI Chatbots (July 20 - August 16)
**Goals:** Implement natural language query system with data isolation

**Deliverables:**

**Week 5: Vector Database & Embeddings**
- Set up FAISS or ChromaDB vector store
- Choose embedding model (sentence-transformers: all-MiniLM-L6-v2 or all-mpnet-base-v2)
- Data ingestion pipeline:
  - Extract all time_entry records, schedules, shift_notes
  - Generate text descriptions ("John Doe worked 8.5 hours on 2026-07-15 in Front Desk department")
  - Create embeddings for each record
  - Store in vector DB with metadata (user_id, department, timestamp)
- Test similarity search with sample queries

**Week 6: LLM Integration**
- Download and configure small LLM (Llama 3.2 1B or Phi-3-mini)
- Set up inference server (Ollama or llama.cpp)
- Prompt engineering:
  - System prompt for employee bot: "You are a helpful assistant. Only provide information about the user's own work history."
  - System prompt for admin bot: "You are a helpful assistant for hotel management. Provide information about any employee."
- Test basic Q&A with static data

**Week 7: Data Isolation & Query Routing**
- Implement role-based vector filtering:
  - Employee query → filter vector store by user_id = current_user
  - Admin query → no filtering, access full vector store
- Build RAG pipeline:
  1. User submits natural language query
  2. Generate query embedding
  3. Similarity search in filtered vector store (top 5 results)
  4. Construct LLM prompt with retrieved context
  5. Generate answer with LLM
  6. Return answer to user
- Handle edge cases (no relevant data found, ambiguous queries, date range parsing)

**Week 8: Chatbot UI & Integration**
- **Employee chatbot interface:**
  - Chat window in employee portal
  - Message history display
  - Loading indicator during LLM inference
  - Example questions ("How many hours did I work last week?", "When is my next shift?")
- **Admin chatbot interface:**
  - Chat window in admin dashboard
  - Support for employee name queries ("How many hours did John work in July?")
  - Aggregate queries ("Who worked overtime this month?")
- **Backend API:**
  - POST /api/chat/employee (scoped to current user)
  - POST /api/chat/admin (access to all data)
- Testing with real queries, accuracy evaluation

**RAG System Architecture:**
```
User Query → Embedding Model → Vector Search (filtered by role) → 
Retrieve Top K Results → LLM Prompt Construction → LLM Inference → 
Answer Generation → Return to User
```

**End-of-Summer Deliverables:**
- Summer quarter status report to faculty adviser
- Demo to hotel manager (overtime system, forecasting, AI chatbots)
- Updated test coverage (target: 75%+)

---

### **FALL 2026 (2 credits + CSS 430 Operating Systems) - Analytics, Testing, Polish**

#### Week 1-3: Analytics Dashboard (September 28 - October 18)
**Goals:** Build comprehensive analytics and data visualization

**Deliverables:**
- **Labor cost analytics:**
  - Total labor cost by day/week/month (sum of all hours * rates)
  - Labor cost as % of revenue (if revenue data available)
  - Cost per occupied room (labor cost / occupied rooms)
  - Overtime cost breakdown
- **Staffing analytics:**
  - Peak staffing hours heatmap (hour of day vs. day of week)
  - Average hours per employee by department
  - Overtime trend chart (% of employees with overtime each week)
  - Shift coverage gaps (scheduled vs. actual clock-ins)
- **Forecasting analytics:**
  - Room forecast accuracy (predicted vs. actual occupancy)
  - Forecast error trends over time
- **Visualization library:**
  - Chart.js or Recharts for React
  - Line charts (trends over time)
  - Bar charts (comparisons across departments/employees)
  - Heatmaps (staffing patterns)
  - Pie charts (labor cost distribution)
- **Dashboard layout:**
  - Tab-based navigation (Labor, Staffing, Forecasting)
  - Date range selectors (Last 7 days, Last 30 days, Custom range)
  - Export charts as PNG
  - Download raw data as CSV

---

#### Week 4-6: Testing, Documentation & Deployment (October 19 - November 8)
**Goals:** Comprehensive testing, production deployment, documentation

**Deliverables:**

**Testing:**
- Unit test coverage: 80%+ (Jest)
- Integration tests for all API endpoints (Supertest)
- End-to-end tests for critical workflows (Cypress):
  - Employee: Clock in → View schedule → Clock out
  - Admin: Create schedule → Approve time edit → Export payroll
  - Front Desk: View forecast → Create shift note
- Performance testing:
  - Load test with 100+ concurrent users (Artillery or k6)
  - Database query optimization for slow queries (EXPLAIN ANALYZE)
- Security testing:
  - OWASP ZAP scan for common vulnerabilities
  - Manual testing for RBAC bypass attempts
  - SQL injection testing with sqlmap

**Documentation:**
- **Technical documentation:**
  - API documentation (Swagger/OpenAPI spec)
  - Database schema documentation with ER diagrams
  - Deployment guide (infrastructure setup, environment variables, database migrations)
  - Developer onboarding guide
- **User documentation:**
  - Employee user guide (how to clock in/out, view schedule, use chatbot)
  - Admin user guide (create schedules, manage users, run reports)
  - Front desk user guide (forecasting dashboard, shift notes)
  - FAQ and troubleshooting guide
- **Code documentation:**
  - JSDoc comments for all functions
  - README.md with project overview, setup instructions, tech stack
  - CONTRIBUTING.md for future developers

**Production Deployment:**
- Deploy to production environment (AWS, Vercel, or DigitalOcean)
- Set up monitoring (Sentry for error tracking, Datadog for performance)
- Configure automated backups (daily PostgreSQL dumps to S3)
- SSL certificate setup (Let's Encrypt)
- Domain configuration (e.g., hotelops.snoqualmieinn.com)
- Load balancer configuration if using multiple instances

---

#### Week 7-9: Staff Training & Final Polish (November 9 - November 29)
**Goals:** User acceptance testing, bug fixes, staff training

**Deliverables:**
- **User acceptance testing (UAT):**
  - Front desk staff test forecasting dashboard (3-5 users, 30 min each)
  - Housekeeping/maintenance test employee portal
  - Manager tests admin functions (schedule creation, approvals, reports)
  - Collect feedback, prioritize bug fixes
- **Bug fixes and polish:**
  - Fix any critical bugs found in UAT
  - UI/UX improvements based on staff feedback
  - Performance optimizations
  - Accessibility improvements (WCAG 2.1 compliance for screen readers)
- **Staff training:**
  - In-person training session at hotel (2 hours)
  - Training materials (quick reference guides, video tutorials)
  - Q&A session with hotel staff
- **Data migration:**
  - Import historical time entry data from punch cards (if available)
  - Import existing employee roster
  - Import base pay rates

---

#### Week 10-11: Colloquium Preparation (November 30 - December 12)
**Goals:** Prepare and deliver capstone presentation

**Deliverables:**
- **Abstract (due Monday Dec 8, 7:00am):**
  - 150-200 word project summary
  - Highlight AI/RAG system, RBAC, analytics features
- **Poster (due Monday Dec 8, 7:00am):**
  - System architecture diagram
  - Key features with screenshots
  - Technology stack
  - Results/impact (hours saved, error reduction, staff feedback)
- **Presentation slides (due Friday Dec 12, day of presentation):**
  - 8-12 minute oral presentation
  - Problem statement (manual Excel processes)
  - Solution overview (HotelOps platform)
  - Technical implementation highlights (RAG system, RBAC, web scraping)
  - Demo video (2-3 minutes showing clock-in, chatbot query, forecasting)
  - Lessons learned and future work
  - Q&A preparation
- **Final report:**
  - Comprehensive technical report (20-30 pages)
  - Introduction, background, requirements, design, implementation, testing, results, conclusion
  - Appendices (code samples, API documentation, database schema)

**Presentation Date:** Friday, December 12, 2026 (Fall 2026 Capstone Colloquium)

---

## POTENTIAL CHALLENGES & MITIGATION STRATEGIES

### **Technical Challenges**

**1. Web Scraping Reliability**
- **Challenge:** PMS system may have anti-scraping measures, CAPTCHAs, or frequent UI changes
- **Mitigation:**
  - Implement robust error handling with retry logic
  - Add fallback to manual data entry if scraping fails
  - Contact PMS vendor to request API access
  - Use headless browser (Puppeteer) to handle JavaScript-heavy sites
  - Monitor scraper health with alerts for failures

**2. RAG System Data Isolation**
- **Challenge:** Ensuring employee bot only accesses their own data (security critical)
- **Mitigation:**
  - Implement vector store filtering at query level (not training level)
  - Add middleware to verify user role before RAG pipeline
  - Unit tests for data isolation (employee should never see others' data)
  - Security audit by third party if time permits
  - Fallback: If isolation proves difficult, launch admin bot only in first version

**3. LLM Hallucination**
- **Challenge:** LLM may generate incorrect answers not supported by retrieved data
- **Mitigation:**
  - Strict prompt engineering ("Only answer using provided context")
  - Show retrieved context to user alongside answer for verification
  - Add confidence scores (if available from model)
  - Human-in-loop for critical queries (payroll-related)
  - Continuous evaluation with test query set

**4. Database Query Performance**
- **Challenge:** Time aggregation queries may be slow with large datasets (100k+ time entries)
- **Mitigation:**
  - Database indexing on frequently queried columns
  - Materialized views for expensive aggregations
  - Query optimization with EXPLAIN ANALYZE
  - Pagination for large result sets
  - Caching layer (Redis) for frequently accessed data

**5. Timezone Handling**
- **Challenge:** Employees may clock in/out across different timezones (unlikely for single hotel, but good practice)
- **Mitigation:**
  - Store all timestamps in UTC in database
  - Convert to local timezone (hotel timezone) for display
  - Use libraries (moment-timezone or date-fns-tz) for timezone conversions
  - Test with edge cases (daylight saving time transitions)

### **Organizational Challenges**

**1. Scope Creep**
- **Challenge:** Hotel manager may request additional features mid-project
- **Mitigation:**
  - Maintain clear requirements document with sign-off
  - Weekly status meetings to manage expectations
  - Feature request backlog for post-capstone work
  - Communicate impact on timeline for new requests

**2. User Adoption**
- **Challenge:** Staff resistance to new system, preference for Excel
- **Mitigation:**
  - Involve staff in UAT early (get buy-in)
  - Emphasize time savings and ease of use
  - Provide comprehensive training with hands-on practice
  - Gradual rollout (pilot with one department first)
  - Collect and address feedback quickly

**3. Data Migration**
- **Challenge:** Importing historical punch card data may be incomplete or messy
- **Mitigation:**
  - Accept that some historical data may be lost
  - Build CSV import tool for flexibility
  - Manual data entry for critical missing records
  - Set clear cutover date (e.g., "system starts clean on April 1")

### **Schedule Risks**

**1. Concurrent CSS 430 Coursework (Fall 2026)**
- **Challenge:** Balancing capstone work with Operating Systems course
- **Mitigation:**
  - Front-load heavy development to Spring/Summer
  - Fall quarter focuses on testing, polish, documentation (less coding-intensive)
  - Keep weekly capstone hours to 20 hrs/week in Fall (vs 40 hrs in Spring/Summer)

**2. Deployment Delays**
- **Challenge:** Cloud infrastructure issues, networking problems
- **Mitigation:**
  - Set up infrastructure early (Week 1-2 of Spring)
  - Use managed services to reduce DevOps complexity (AWS RDS, Vercel, Supabase)
  - Have backup deployment plan (DigitalOcean VPS if AWS fails)
  - Test deployment pipeline continuously, not just at the end

---

## EVALUATION CRITERIA

### **Technical Evaluation (60%)**

**Functionality (25%)**
- All four core modules fully functional (Auth/Scheduling, Time/Payroll, Forecasting, RAG Chatbots)
- RBAC working correctly (Employee, Front Desk, Admin roles with proper permissions)
- Web scraper successfully extracts PMS data
- RAG chatbots provide accurate answers with data isolation
- Overtime detection and approval workflows function correctly
- CSV exports generate accurate payroll reports

**Code Quality (15%)**
- Clean, well-documented code following JavaScript/React best practices
- Proper separation of concerns (frontend/backend, controller/service/model layers)
- Efficient database queries with proper indexing
- 80%+ test coverage with passing unit, integration, and E2E tests
- No critical security vulnerabilities (SQL injection, XSS, authentication bypass)

**System Architecture (10%)**
- Scalable architecture using appropriate design patterns
- RESTful API design with proper HTTP semantics
- Secure implementation (JWT auth, RBAC, audit logging, PII protection)
- Proper error handling and logging throughout system
- Well-designed database schema (normalized, efficient)

**User Interface (10%)**
- Intuitive, responsive UI design (works on desktop and mobile)
- Consistent design language across employee and admin portals
- Accessible (keyboard navigation, screen reader support)
- Clear data visualization in analytics dashboard
- Professional appearance suitable for production use

### **Project Management & Documentation (20%)**
- Adherence to three-quarter timeline with minimal scope creep
- Regular status updates to faculty adviser (bi-weekly meetings)
- Comprehensive technical documentation (API docs, deployment guide, ER diagrams)
- User documentation (employee guide, admin guide, FAQ)
- Quality of capstone presentation (abstract, poster, oral presentation)

### **Academic Merit & Learning Outcomes (20%)**
- Demonstration of competencies listed in Section 2
- Reflection on challenges encountered and solutions implemented
- Ability to articulate technical decisions and trade-offs during Q&A
- Integration of knowledge from multiple CSS courses (360, 370, 475, 481, 382, 486, 477)
- Novel contribution (RAG system with role-based data isolation is not commonly seen in student projects)

### **Specific Deliverables Checklist**
- [ ] Deployed, functional web application accessible via URL
- [ ] Source code repository with commit history demonstrating iterative development
- [ ] Database schema documentation with ER diagrams
- [ ] API documentation (Swagger/OpenAPI spec)
- [ ] Test suite with evidence of 80%+ coverage
- [ ] User documentation (employee guide, admin guide, training materials)
- [ ] Capstone poster meeting rubric requirements
- [ ] 8-12 minute oral presentation with slides
- [ ] Final written report documenting architecture, implementation, and lessons learned
- [ ] Demo video (3-5 minutes) showing key features in action

---

## TECHNOLOGY STACK SUMMARY

**Frontend:**
- React 18 (component-based UI)
- React Router (client-side routing)
- TailwindCSS or Material-UI (styling)
- Recharts or Chart.js (data visualization)
- Axios (HTTP client)

**Backend:**
- Node.js v20 + Express.js (API server)
- JWT (authentication)
- bcrypt (password hashing)
- node-cron (scheduled jobs)

**Database:**
- PostgreSQL 16 (primary database)
- FAISS or ChromaDB (vector store for RAG)

**AI/ML:**
- Llama 3.2 1B or Phi-3-mini (small language model)
- sentence-transformers (embedding model: all-MiniLM-L6-v2)
- Ollama or llama.cpp (LLM inference server)

**Web Scraping:**
- Puppeteer (headless Chrome for PMS scraping)
- Cheerio (HTML parsing)

**DevOps:**
- GitHub (version control)
- GitHub Actions (CI/CD)
- AWS Lambda + RDS (serverless deployment) OR Vercel + Supabase
- Sentry (error tracking)
- Datadog or CloudWatch (monitoring)

**Testing:**
- Jest (unit testing)
- Supertest (API integration testing)
- Cypress (E2E testing)
- React Testing Library (component testing)

---

## SUCCESS METRICS

**Quantitative:**
- System uptime: 99%+ during pilot period
- API response time: < 200ms for 95th percentile
- Time entry errors: < 1% (compared to 5-10% with punch cards)
- Admin time savings: 60-70% reduction in payroll processing time
- RAG answer accuracy: > 85% on test query set
- Test coverage: 80%+

**Qualitative:**
- Positive feedback from hotel staff (UAT survey: 4/5 average rating)
- Hotel manager approval for production use
- Faculty adviser satisfaction with technical implementation
- Successful capstone colloquium presentation (positive Q&A reception)

---

## FUTURE ENHANCEMENTS (Post-Capstone)

If time permits or as post-graduation work for the hotel:
1. **Shift swap/coverage request system** - Employees can post shifts they need covered
2. **Mobile app (React Native)** - Native iOS/Android apps for better mobile experience
3. **Predictive staffing model** - ML model to recommend optimal staffing based on historical occupancy
4. **Integration with accounting software** - Direct API integration with QuickBooks or ADP for payroll export
5. **Advanced analytics** - Predictive analytics for labor cost forecasting, anomaly detection for timesheet fraud
6. **Multi-location support** - Extend system to support multiple hotel properties
7. **Employee self-service features** - Request time off, view pay stubs, update contact information
8. **Manager notification preferences** - Configurable alerts (email, SMS, in-app) for different event types

---

**Document Version:** 1.0  
**Last Updated:** April 4, 2026  
**Next Review:** End of Spring Quarter (June 7, 2026)