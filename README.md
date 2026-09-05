# bcom.kart API

Express + MongoDB API for the bcom.kart storefront.

## Run locally

1. Start MongoDB locally, or set `MONGODB_URI` to a hosted MongoDB database.
2. Copy `.env.example` to `.env` and set `JWT_SECRET`, `ADMIN_EMAIL`, and `CLIENT_ORIGIN`.
3. Install and start the API:

```bash
npm install
npm run dev
```

The API runs on `http://localhost:4000` by default. Set `VITE_API_URL=http://localhost:4000/api` in the React app when using another API URL.

The Google account matching `ADMIN_EMAIL` is assigned `ADMIN` on sign-in. All other authenticated accounts are stored as `USER`. Admin routes require the JWT returned from `POST /api/auth/google`.

Product images are uploaded as `multipart/form-data` using the field name `image`. The API accepts image MIME types up to 5 MB, stores files in the local `uploads/` directory, serves them from `/uploads/<filename>`, and saves the public URL in the product's `image` field. The `uploads/` directory is created automatically when the server starts.

## Main routes

- `POST /api/auth/google`: verify a Google access token and upsert the user
- `GET /api/products`: public product list
- `POST/PATCH/DELETE /api/products`: admin catalog management
- `GET/PATCH /api/users`: admin user and role management
- `GET/POST/PATCH/DELETE /api/coupons`: admin coupon management
- `GET/POST /api/orders`: authenticated order access
- `PATCH /api/cart`: authenticated cart persistence
