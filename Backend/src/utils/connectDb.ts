// src/db/connect.ts
import mongoose from 'mongoose'

const connectDB = async () => {
  try {
    if(!process.env.MONGO_URI) throw new Error('MONGO_URI env var is required')
    const conn = await mongoose.connect(process.env.MONGO_URI!)
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection failed:', err)
    process.exit(1)
  }
}

export default connectDB