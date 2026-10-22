// Long-running server (local dev, `npm start`). On Vercel the same app runs as a function: api/index.js.
import { app } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';

await connectDb();
app.listen(config.PORT, () => console.log(`[server] listening on http://localhost:${config.PORT}`));
