import app from './app'
import dotenv from 'dotenv'
import connectDB from './db/connect'

dotenv.config()

const PORT = process.env.PORT || 3000

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
})