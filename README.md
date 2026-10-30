# EdTech CRM Inquiry System

A full-stack inquiry management app for an EdTech business. The public form captures user inquiries into Supabase PostgreSQL, and the admin dashboard exposes a protected JWT-authenticated view with filters and search.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js + Express
- Database: Supabase PostgreSQL
- Auth: Custom JWT + bcrypt

## Features

- Public inquiry form with user type and category selection
- Direct saving into Supabase database
- Custom admin login with JWT auth
- Protected admin dashboard route
- Filtering by category, user type, and name/phone search
- Inquiry status updates from the dashboard

## Project Structure

- `server.js` — Express app and API routes
- `public/` — public form and admin dashboard UI
- `schema.sql` — table definitions for `admins` and `inquiries`
- `.env.example` — sample environment variables

## Setup

1. Clone the project and install dependencies:

   ```bash
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Update the `.env` file with your real Supabase connection string and secure JWT secret.

4. Apply the schema to your Supabase database:

   ```sql
   \i schema.sql
   ```

   Or run the statements manually in the Supabase SQL editor.

5. Start the app:

   ```bash
   npm start
   ```

6. Access the public form at:

   ```text
   http://localhost:5000/
   ```

7. Access the admin dashboard at:

   ```text
   http://localhost:5000/admin
   ```

## Admin Login

The app creates a default admin automatically if one does not exist in the `admins` table.

Default values in `.env.example`:

- Email: `admin@edtech.com`
- Password: `Admin@123`

To test JWT auth manually:

1. Log in via the admin form or call the API:

   ```bash
   curl -X POST http://localhost:5000/api/admin/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@edtech.com","password":"Admin@123"}'
   ```

2. Copy the returned token and use it in the Authorization header:

   ```bash
   curl http://localhost:5000/api/admin/inquiries \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

## Environment Variables

Required variables:

```env
PORT=5000
JWT_SECRET=your_secure_secret
DATABASE_URL=postgresql://postgres:password@db.project.supabase.co:5432/postgres
ADMIN_EMAIL=admin@edtech.com
ADMIN_PASSWORD=Admin@123
```

## Notes

- Supabase Auth is intentionally not used for admin authentication.
- Authentication is custom and implemented from scratch with `bcryptjs` and `jsonwebtoken`.
- If `DATABASE_URL` is not set, the server runs in a limited local mode so the project can be started for review, but the database-backed features require valid Supabase credentials.
