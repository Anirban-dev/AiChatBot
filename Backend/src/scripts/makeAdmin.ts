// backend/scripts/makeAdmin.ts
import mongoose from 'mongoose'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../../../.env') })

import { User } from '../models/user'

const email = process.argv[2]

if (!email) {
  console.error('\x1b[31m%s\x1b[0m', '❌ Error: Please provide a user email.')
  console.log('Usage: npx tsx scripts/makeAdmin.ts user@example.com\n')
  process.exit(1)
}

async function makeAdmin() {
  const mongoUri = process.env.MONGO_URI || process.env.DATABASE_URL

  if (!mongoUri) {
    console.error('\x1b[31m%s\x1b[0m', '❌ MONGO_URI or DATABASE_URL not found in env.')
    process.exit(1)
  }

  try {
    console.log('⏳ Connecting to database...')
    await mongoose.connect(mongoUri)
    console.log('✅ Database connected.\n')

    console.log(`🔍 Looking up: "${email}"...`)
    const user = await User.findOne({ email: email.toLowerCase().trim() })

    if (!user) {
      console.error('\x1b[31m%s\x1b[0m', `❌ No user found with email "${email}"`)
      process.exit(1)
    }

    console.log(`👤 Found: ${user.name || 'N/A'} (${user.email})`)
    console.log(`   Current role: ${user.role}`)

    // Only set fields your REAL schema actually defines.
    // If your model uses only `role`, remove the isAdmin line.
    user.role = 'admin'
    // user.isAdmin = true  // ← uncomment only if your real User schema has this field

    await user.save()

    console.log('\n\x1b[32m%s\x1b[0m', `🚀 ${user.email} promoted to admin!`)
    console.log(`   New role: ${user.role}\n`)

  } catch (err) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Script failed:')
    console.error(err)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected.')
    process.exit(0)
  }
}

makeAdmin()