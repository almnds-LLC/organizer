# Drawer Organizer

A collaborative 3D drawer organization app built with React, Three.js, and Cloudflare Workers. Organize physical drawer contents with a visual interface, share rooms with others, and collaborate in real-time.

## Features

### 3D Visualization
Interactive 3D representation of drawers using React Three Fiber. Click and drag to navigate, select compartments to view and edit contents. Drawers slide open when selected to reveal their interior.

### Compartment System
Each drawer is a grid of compartments. Compartments can be subdivided with horizontal or vertical dividers, creating sub-compartments for organizing smaller items. Each sub-compartment can hold a labeled item with optional category and quantity.

### Categories
Create categories to organize items by type. Categories have colors (12 presets or custom hex) that display on items in both the 3D view and inventory list. Helps quickly identify item types at a glance.

### Search
Global search across all drawers and items. Matching compartments highlight in the 3D view, making it easy to locate items visually.

### Rooms & Collaboration
Organize drawers into rooms. Invite other users to collaborate on a room with role-based permissions:
- **Owner**: Full control, can delete room and manage all members
- **Editor**: Can add/edit/delete drawers and items
- **Viewer**: Read-only access

Invitations can include permission to invite others, enabling delegated room management.

### Real-time Sync
Changes sync instantly between all connected users via WebSockets. When you edit an item, everyone viewing that room sees the change immediately. Powered by Cloudflare Durable Objects for stateful connections at the edge.

### Offline Support
Works fully offline. Changes queue locally and sync when connection restores. Visual indicator shows pending changes and connection status. Conflicts (when the same item is edited by multiple users while offline) show a resolution dialog.

### Mobile Experience
Responsive design with a bottom sheet UI on mobile. The sheet snaps to collapsed, half, and full heights with gesture-based navigation. Touch interactions mirror desktop behavior - tap to select, double-tap to open details.

## Tech Stack

### Frontend
- **React 19** with React Compiler for optimized rendering
- **Three.js** via React Three Fiber for 3D graphics
- **Zustand** for state management with localStorage persistence
- **Vite** for development and builds
- **CSS Modules** for scoped styling

### Backend
- **Cloudflare Workers** for edge-deployed serverless API
- **Hono** as the web framework
- **D1** (SQLite) for the database
- **Durable Objects** for real-time WebSocket connections
- **Turnstile** for bot protection on auth endpoints

## API Overview

### Authentication
JWT-based auth with access tokens (short-lived) and refresh tokens (HTTP-only cookies). Turnstile verification required for login/register to prevent bots.

### Rooms
CRUD operations for rooms. Each user gets a default room on registration. Rooms contain drawers and categories, and track member permissions.

### Members & Invitations
Room owners can invite users by username. Invitees see pending invitations and can accept/decline. Members can be promoted/demoted or removed. The invite permission can be granted separately from role.

### Drawers
CRUD for drawers within a room. Each drawer has a name, grid dimensions (rows × cols), and position on the room grid. Compartments are auto-created based on dimensions.

### Compartments & Items
Update compartment divider orientation and count. Set/clear items in sub-compartments with label, category, and quantity. Batch updates supported for efficiency.

### Categories
CRUD for categories within a room. Categories have a name and color (preset index or custom hex).

### WebSocket
Real-time connection per room. Broadcasts create/update/delete events for drawers, compartments, items, and categories. Also broadcasts user join/leave for presence.

## Development

```bash
# Frontend
npm install
npm run dev

# Backend
cd api
npm install
npm run dev
```

## Environment

**Frontend (.env):**
- `VITE_API_URL` - Backend URL (default: http://localhost:8787)
- `VITE_TURNSTILE_SITE_KEY` - Cloudflare Turnstile site key

**Backend (wrangler secrets):**
- `JWT_SECRET` - Secret for signing JWTs
- `TURNSTILE_SECRET_KEY` - Turnstile secret for verification

## Deployment

Frontend deploys to Cloudflare Pages, backend to Cloudflare Workers. Both use `npm run build` / `npm run deploy` respectively.

## License

MIT
