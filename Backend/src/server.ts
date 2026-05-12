import path from 'path';
import dotenv from 'dotenv';

const envPath = path.resolve(__dirname, '../../.env');
dotenv.config({ path: envPath });

import app from './app';
import connectDB from './db/connect';


const PORT = 3000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});