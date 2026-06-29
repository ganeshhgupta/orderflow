// src/api.ts
// In dev: CRA proxy forwards to localhost:8000 (package.json "proxy")
// In prod: REACT_APP_API_BASE points to the Render backend URL
export const API_BASE = process.env.REACT_APP_API_BASE?.replace(/\/$/, '') ?? '';
