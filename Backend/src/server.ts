import path from 'path';
import dotenv from 'dotenv';

// In Docker, env vars are injected via docker-compose, so dotenv is a no-op.
// For local dev, it loads .env from the project root (2 dirs up from dist/server.js).
const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });
dotenv.config(); // fallback: also check cwd .env (safe in Docker)

const startServer = async () => {
  try {
    const { default: app } = await import('./app');
    const { default: connectDB } = await import('./utils/connectDb');
    const { TierConfig, FREE_TIER_SEED } = await import('./models/tier');

    const PORT = 3000;

    await connectDB();

    // ── Seed the protected "free" tier if it doesn't exist yet ────────────────
    const existing = await TierConfig.findOne({ name: 'free' });
    if (!existing) {
      await TierConfig.create(FREE_TIER_SEED);
      console.log('[Tier Seed] "free" tier created in DB.');
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();