import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

const startServer = async () => {
  try {
    const { default: app } = await import('./app');
    const { default: connectDB } = await import('./utils/connectDb');

    const PORT = 3000;

    await connectDB();
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();